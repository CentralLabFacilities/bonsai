package de.unibi.citec.clf.bonsai.skills.ecwm.knowledge

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.robocup.ModelWithAttributes
import de.unibi.citec.clf.btl.data.world.Entity
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 * Fetches attributes of the given Model Type
 *
 * <pre>
 *
 * Options:
 *  type:               [String] Optional (default: "")
 *  from_string:        [Boolean] Read the typename from a String Slot (default: False)
 *
 * Slots:
 *  Entity      [Entity] Optional, Uses this slot to get the type if not set with option
 *  Type        [String] Optional, Use this if option from_string is set
 *  Attributes: [ModelWithAttributes]
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
    private val KEY_FROM_STRING = "from_string"

    private var fur: Future<ModelWithAttributes?>? = null
    private var ecwm: ECWMRobocup? = null
    private var tokenSuccess: ExitToken? = null

    private var entity: MemorySlotReader<Entity>? = null
    private var type: MemorySlotReader<String>? = null
    private var attributes: MemorySlotWriter<ModelWithAttributes>? = null

    private var typename: String = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        ecwm = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)
        attributes = configurator.getWriteSlot("Attributes", ModelWithAttributes::class.java)

        if (configurator.hasConfigurationKey(KEY_TYPE)) {
            if(configurator.hasConfigurationKey(KEY_FROM_STRING))
                throw ConfigurationException("cant mix $KEY_TYPE and $KEY_FROM_STRING")
            typename = configurator.requestValue(KEY_TYPE)
        } else {
            if(configurator.hasConfigurationKey(KEY_FROM_STRING)) {
                type = configurator.getReadSlot("Type", String::class.java)
            } else {
                entity = configurator.getReadSlot("Entity", Entity::class.java)
            }
        }
    }

    override fun init(): Boolean {
        if(entity != null) {
            val e = entity!!.recall<Entity>() ?: return false
            typename = e.modelName
        } else if(type != null) {
            typename = type!!.recall<String>() ?: return false;
        }

        logger.debug("get Attributes of Type: '${typename}'")
        fur = ecwm!!.getModelAttributes(ModelWithAttributes(typename))

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
        } catch (e: ExecutionException) {
            logger.error("could not get attributes")
            return ExitToken.fatal();
        }

        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}