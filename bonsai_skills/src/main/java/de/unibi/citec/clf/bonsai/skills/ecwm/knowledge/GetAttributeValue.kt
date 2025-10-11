package de.unibi.citec.clf.bonsai.skills.ecwm.knowledge

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.robocup.EntityWithAttributes
import de.unibi.citec.clf.btl.data.knowledge.Attributes
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.Model
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 * Fetches an attribute value of the given Entity or Model
 *
 * <pre>
 *
 * Options:
 *  error_on_multiple   [Boolean] Error if values.size()>1, else we just get the first (default: True)
 *  attribute:          [String] The attribute key
 *  type:               [String] Optional (default: "")
 *  type_from_string:   [Boolean] Read the modeltype from a String Slot (default: False)
 *  use_model_slot:     [Boolean] Use Model instead of Entity (default: False)
 *
 * Slots:
 *  Entity      [Entity] Optional, Uses this slot to get the entity if `type` option is not set
 *  Model       [Model] Optional, Uses this slot to get the modeltype if `use_model_slot` is set
 *  Type        [String] Optional, Use this if option `type_from_string` is set
 *  Value:      [String] The Attribute Value
 *
 * ExitTokens:
 *  Error.missing:        does not have the requested attribute
 *  Error.multiple:       does have multiple values for the requested attribute
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetAttributeValue : AbstractSkill() {

    private val KEY_TYPE = "type"
    private val KEY_ATTRIBUTE = "attribute"
    private val KEY_ERROR = "error_on_multiple"
    private val KEY_FROM_STRING = "type_from_string"
    private val KEY_MODEL_SLOT = "use_model_slot"

    private var fur: Future<Attributes?>? = null

    private var ecwm: ECWMRobocup? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenErrorMissing: ExitToken? = null
    private var tokenErrorMultiple: ExitToken? = null

    private var entity: MemorySlotReader<Entity>? = null
    private var model: MemorySlotReader<Model>? = null
    private var type: MemorySlotReader<String>? = null
    private var attribute: MemorySlotWriter<String>? = null

    private var typename: String? = null
    private var key = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenErrorMissing = configurator.requestExitToken(ExitStatus.ERROR().ps("missing"))
        if(configurator.hasConfigurationKey(KEY_ERROR)) {
            tokenErrorMultiple = configurator.requestExitToken(ExitStatus.ERROR().ps("multiple"))
        }

        key = configurator.requestValue(KEY_ATTRIBUTE)

        ecwm = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)
        attribute = configurator.getWriteSlot("Value", String::class.java)

        if (configurator.hasConfigurationKey(KEY_TYPE)) {
            if(configurator.hasConfigurationKey(KEY_FROM_STRING))
                throw ConfigurationException("cant mix $KEY_TYPE and $KEY_FROM_STRING")
            if(configurator.hasConfigurationKey(KEY_MODEL_SLOT))
                throw ConfigurationException("cant mix $KEY_TYPE and $KEY_MODEL_SLOT")
            typename = configurator.requestValue(KEY_TYPE)
        } else {
            if(configurator.hasConfigurationKey(KEY_FROM_STRING)) {
                type = configurator.getReadSlot("Type", String::class.java)
            } else if (configurator.hasConfigurationKey(KEY_MODEL_SLOT)) {
                model = configurator.getReadSlot("Model", Model::class.java)
            } else {
                entity = configurator.getReadSlot("Entity", Entity::class.java)
            }
        }
    }

    override fun init(): Boolean {
        val use_type = typename?: model?.recall<Model>()?.typeName

        if (use_type != null) {
            logger.debug("get Attributes of Type: '${use_type}'")
            fur = ecwm!!.getModelAttributes((use_type!!))
            return true
        } else {
            val e = entity?.recall<Entity>() ?: run {
                logger.error("Entity is null")
                return false
            }
            logger.debug("get Attributes of Entity: '${e!!.id}'")
            fur = ecwm!!.getEntityAttributes(e!!)
        }

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
                    for (kv in it.attributeListMap) {
                        logger.debug(" - '${kv.key}': '${kv.value}'")
                    }
                }

                if (it.hasAttribute(key)) {
                    val values = it.getAttribute(key)!!
                    if(tokenErrorMultiple != null && values.size > 1 ) {
                        logger.debug("Got attribute multipleValues: '${values}' and $KEY_ERROR is set")
                        return tokenErrorMultiple!!
                    }
                    logger.debug("Got attribute values: '${values}' memorize first element")
                    attribute!!.memorize(values.first())
                } else {
                    return tokenErrorMissing!!
                }
                return tokenSuccess!!
            }
        } catch (e: ExecutionException ) {
            logger.error("could not get attributes")
            return ExitToken.fatal();
        }

        logger.error("attributes null")
        return ExitToken.fatal();
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
