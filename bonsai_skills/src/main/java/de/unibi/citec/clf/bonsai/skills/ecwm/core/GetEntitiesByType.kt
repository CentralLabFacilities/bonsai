package de.unibi.citec.clf.bonsai.skills.ecwm.core

import de.unibi.citec.clf.bonsai.actuators.WorldModel
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.EntityList
import java.util.concurrent.Future

/**
 * Gets all Entity with the given type (by Model Type Name)
 *
 * <pre>
 *
 * Options:
 *  expr:               [String] Type name
 *
 * Slots:
 *  Entities: [EntityList]
 *
 * ExitTokens:
 *  success:    Got Entities
 *  error:      No Matching Entities found
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetEntitiesByType : AbstractSkill() {

    private val KEY_EXPRESSION = "expr"

    private var fur: Future<EntityList?>? = null
    private var ecwm: WorldModel? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var slot: MemorySlotWriter<EntityList>? = null
    private var exp: String = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())

        slot = configurator.getWriteSlot("EntityList", EntityList::class.java)
        ecwm = configurator.getActuator("ECWMCore", WorldModel::class.java)

        exp = configurator.requestOptionalValue(KEY_EXPRESSION, exp)
    }

    override fun init(): Boolean {

        fur = ecwm?.fetchEntitiesByType(exp);

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        logger.debug("fut is done")
        val ents = fur?.get()

        if (ents != null) {
            logger.debug("GetEntities with expr:$exp returned ${ents.size} entities")
            for (e in ents) {
                logger.debug("  - $e")
            }
        }

        slot?.memorize(ents)

        return if (!ents.isNullOrEmpty()) tokenSuccess!! else tokenError!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
