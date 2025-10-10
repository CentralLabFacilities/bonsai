package de.unibi.citec.clf.bonsai.skills.ecwm.knowledge

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.EntityList
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 * Get all Entities with the given attribute
 *
 * <pre>
 *
 * Options:
 *  key:          [String] Optional The attribute key (default: "category")
 *  value:        [String] Optional The attribute value
 *
 * Slots:
 *  EntityList        [EntityList]
 *  Value             [String] Optional The attribute value
 *
 * ExitTokens:
 *  success:        Found the Entities with Attribute k=v
 *  error.empty:    Found no Entities with Attribute k==v
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetEntitiesWithAttributeValue : AbstractSkill() {

    private val KEY_KEY = "key"
    private val KEY_VALUE = "value"

    private var fur: Future<EntityList?>? = null
    private var ecwm: ECWMRobocup? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenEmpty: ExitToken? = null

    private var types: MemorySlotWriter<EntityList>? = null
    private var slotValue: MemorySlotReader<String>? = null

    private var key: String = "given_name"
    private var value: String = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenEmpty = configurator.requestExitToken(ExitStatus.ERROR().ps("empty"))
        ecwm = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)
        types = configurator.getWriteSlot("EntityList", EntityList::class.java)

        key = configurator.requestOptionalValue(KEY_KEY, key)
        if (configurator.hasConfigurationKey(KEY_VALUE)) {
            value = configurator.requestValue(KEY_VALUE)
        } else {
            slotValue = configurator.getReadSlot("Value", String::class.java)
        }
    }

    override fun init(): Boolean {
        value = slotValue?.recall<String>() ?: value

        logger.debug("get Types with attribute: '${key}'=='$value'")
        val attributes = mapOf(key to value)
        fur = ecwm!!.getEntitiesWithAttributes(attributes)
        return true
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        try {
            fur?.get()?.let {
                if (logger.isDebugEnabled) {
                    logger.debug("Matching Entities:")
                    for (m in it) logger.debug(" - $m")
                }
                if (it.isEmpty()) {
                    return tokenEmpty!!
                } else {
                    types?.memorize(it)
                }
            }
        } catch (e: ExecutionException ) {
            logger.error("could not get Entities")
            return ExitToken.fatal();
        }

        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
