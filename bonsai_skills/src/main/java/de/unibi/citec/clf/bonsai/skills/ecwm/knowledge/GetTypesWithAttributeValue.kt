package de.unibi.citec.clf.bonsai.skills.ecwm.knowledge

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.ModelList
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 * Get all Model Types with the given attribute
 *
 * <pre>
 *
 * Options:
 *  key:          [String] Optional The attribute key (default: "category")
 *  value:        [String] The attribute value
 *
 * Slots:
 *  ModelList        [ModelList]
 *
 * ExitTokens:
 *  success:        Found the Models with Attribute k=v
 *  error.empty:    Found no Model with Attribute k==v
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetTypesWithAttributeValue : AbstractSkill() {

    private val KEY_KEY = "key"
    private val KEY_VALUE = "value"

    private var fur: Future<ModelList?>? = null
    private var ecwm: ECWMRobocup? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenEmpty: ExitToken? = null

    private var types: MemorySlotWriter<ModelList>? = null

    private var key: String = "category"
    private var value: String = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenEmpty = configurator.requestExitToken(ExitStatus.ERROR().ps("empty"))
        ecwm = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)
        types = configurator.getWriteSlot("ModelList", ModelList::class.java)

        key = configurator.requestOptionalValue(KEY_KEY, key)
        value = configurator.requestValue(KEY_VALUE)
    }

    override fun init(): Boolean {

        logger.debug("get Types with attribute: '${key}'=='$value'")
        val attributes = mapOf(key to value)
        fur = ecwm!!.getTypesWithAttributes(attributes)

        return true
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        try {
            fur?.get()?.let {
                if (logger.isDebugEnabled) {
                    logger.debug("Matching Types:")
                    for (m in it) logger.debug(" - $m")
                }
                if (it.isEmpty()) {
                    return tokenEmpty!!
                } else {
                    types?.memorize(it)
                }
            }
        } catch (e: ExecutionException ) {
            logger.error("could not get types")
            return ExitToken.fatal();
        }

        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
