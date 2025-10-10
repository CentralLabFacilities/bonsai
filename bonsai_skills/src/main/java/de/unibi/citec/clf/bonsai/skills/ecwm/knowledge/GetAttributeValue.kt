package de.unibi.citec.clf.bonsai.skills.ecwm.knowledge

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Model
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 * Fetches the Value of a given Attribute for a specific Model Type
 *
 * <pre>
 *
 * Options:
 *  attribute:          [String] The attribute key
 *  type:               [String] Optional (default: "")
 *
 * Slots:
 *  Type        [Model] Optional, Use this if not set with Option
 *  Value:      [String] The Attribute Value
 *
 * ExitTokens:
 *  Error:        The Model Type does not have the requested attribute
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetAttributeValue : AbstractSkill() {

    private val KEY_TYPE = "type"
    private val KEY_ATTRIBUTE = "attribute"

    private var fur: Future<Map<String,List<String>>?>? = null
    private var ecwm: ECWMRobocup? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var type: MemorySlotReader<Model>? = null
    private var attribute: MemorySlotWriter<String>? = null

    private var typename: String = ""
    private var key = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())
        ecwm = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)
        attribute = configurator.getWriteSlot("Value", String::class.java)

        key = configurator.requestValue(KEY_ATTRIBUTE)

        if (configurator.hasConfigurationKey(KEY_TYPE)) {
            typename = configurator.requestValue(KEY_TYPE)
        } else {
             type = configurator.getReadSlot("Type", Model::class.java)
        }
    }

    override fun init(): Boolean {
        typename = type?.recall<Model>()?.typeName ?: typename
        logger.debug("get Attribute '$key' of Type: '${typename}'")
        fur = ecwm!!.getModelAttributes(typename)

        return true
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        try {
            fur?.get()?.let {
                if (logger.isDebugEnabled) {
                    logger.debug("Got attributes:")
                    for (kv in it) {
                        logger.debug(" - '${kv.key}': '${kv.value}'")
                    }
                }

                if (it.containsKey(key)) {
                    logger.debug("Got attribute values: '${it[key]}' memorize first element")
                    attribute!!.memorize(it[key]?.first())
                } else {
                    return tokenError!!
                }
            }
        } catch (e: ExecutionException ) {
            logger.error("could not get attributes")
            return ExitToken.fatal();
        }

        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
