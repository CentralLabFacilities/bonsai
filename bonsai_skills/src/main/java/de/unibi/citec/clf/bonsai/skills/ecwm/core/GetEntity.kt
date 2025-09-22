package de.unibi.citec.clf.bonsai.skills.ecwm.core

import de.unibi.citec.clf.bonsai.actuators.WorldModel
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Entity
import java.util.concurrent.Future
import javax.naming.CommunicationException

/**
 * Gets Entity with the given id from the world model
 *
 * <pre>
 *
 * Options:
 *  name:   [String] (optional) Entity name
 *
 * Slots:
 *  StringSlot: [String] [Read]
 *  Entity: [Entity] [Write]
 *
 * ExitTokens:
 *  success:    Got Entities
 *  error:      No Matching Entities found
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetEntity : AbstractSkill() {

    private var fur: Future<Entity?>? = null
    private var ecwm: WorldModel? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var slot: MemorySlotWriter<Entity>? = null
    private var expSlot: MemorySlotReader<String>? = null
    private var exp: String = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())

        slot = configurator.getWriteSlot("Entity", Entity::class.java)
        ecwm = configurator.getActuator("ECWMCore", WorldModel::class.java)

        if (configurator.hasConfigurationKey(KEY_EXPRESSION)) {
            exp = configurator.requestOptionalValue(KEY_EXPRESSION, exp)
        } else {
            expSlot = configurator.getReadSlot("StringSlot", String::class.java)
        }
    }

    override fun init(): Boolean {

        if (expSlot != null) {
            try {
                exp = expSlot!!.recall<String>()
            } catch (e: CommunicationException) {
                logger.error("error requesting value from slot. $e")
                return false
            }
        }

        val expConverted = exp.replace(" ", "_")
        logger.debug("entity: ($exp) -> $expConverted")

        fur = ecwm?.getEntity(expConverted);

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        logger.debug("fut is done")
        var ent : Entity? = null
        try {
            ent = fur?.get()
        } catch (e: Exception) {
            logger.error("entity: '$exp' not found")
        }

        if (ent != null) {
            logger.debug("GetEntities with expr:$exp returned ${ent}")

        }

        slot?.memorize(ent)

        return if (ent != null ) tokenSuccess!! else tokenError!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }

    companion object {
        private const val KEY_EXPRESSION = "name"
    }
}
