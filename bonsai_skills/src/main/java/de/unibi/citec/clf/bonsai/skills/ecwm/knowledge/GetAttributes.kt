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
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.Model
import de.unibi.citec.clf.btl.data.ecwm.robocup.ModelWithAttributes
import de.unibi.citec.clf.btl.data.knowledge.Attributes
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 * Fetches attributes of the given Entity or Model
 *
 * <pre>
 *
 * Options:
 *  type:               [String] Optional (default: "")
 *  type_from_string:   [Boolean] Read the modeltype from a String Slot (default: False)
 *  use_model_slot:     [Boolean] Use Model instead of Entity (default: False)
 *
 * Slots:
 *  Entity      [Entity] Optional, Uses this slot to get the entity if `type` option is not set
 *  Model       [Model] Optional, Uses this slot to get the modeltype if `use_model_slot` is set
 *  Type        [String] Optional, Use this if option `type_from_string` is set
 *  Attributes: [Attributes]
 *
 *
 * ExitTokens:
 *  success:        Got Entities
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetAttributes : AbstractSkill() {

    private val KEY_TYPE = "type"
    private val KEY_FROM_STRING = "type_from_string"
    private val KEY_MODEL_SLOT = "use_model_slot"

    private var fur: Future<Attributes?>? = null

    private var ecwm: ECWMRobocup? = null
    private var tokenSuccess: ExitToken? = null

    private var entity: MemorySlotReader<Entity>? = null
    private var model: MemorySlotReader<Model>? = null
    private var type: MemorySlotReader<String>? = null

    private var attributes: MemorySlotWriter<Attributes>? = null

    private var typename: String? = null

    // used for ref
    private var e: Entity? = null
    private var use_type: String? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        ecwm = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)
        attributes = configurator.getWriteSlot("Attributes", Attributes::class.java)

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
        use_type = typename?: model?.recall<Model>()?.typeName

        if (use_type != null) {
            logger.debug("get Attributes of Type: '${use_type}'")
            fur = ecwm!!.getModelAttributes((use_type!!))
            return true
        } else {
            e = entity?.recall<Entity>() ?: run {
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
                attributes?.memorize(it)
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
