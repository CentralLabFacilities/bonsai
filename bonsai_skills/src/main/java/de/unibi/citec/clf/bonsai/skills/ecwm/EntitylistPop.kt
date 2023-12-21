package de.unibi.citec.clf.bonsai.skills.ecwm

import de.unibi.citec.clf.bonsai.actuators.ECWMActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlot
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.Entity
import de.unibi.citec.clf.btl.data.ecwm.EntityList
import java.util.concurrent.Future

/**
 * pop one [Entity] from an [EntityList]
 */
class EntitylistPop : AbstractSkill() {

    private var tokenSuccess: ExitToken? = null
    private var tokenNoItem: ExitToken? = null

    private var slot: MemorySlot<EntityList>? = null
    private var entity: MemorySlotWriter<Entity>? = null

    private var entitylist: EntityList? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenNoItem = configurator.requestExitToken(ExitStatus.ERROR().ps("noItem"))

        slot = configurator.getSlot("Entities", EntityList::class.java)
        entity = configurator.getWriteSlot("Entity", Entity::class.java)
    }

    override fun init(): Boolean {

        entitylist = slot!!.recall<EntityList>() ?: return false
        logger.debug(!entitylist!!.isEmpty())
        return true
    }


    override fun execute(): ExitToken {
        if (entitylist!!.isEmpty()) {
            logger.debug("EntityList is empty")
            return tokenNoItem!!
        }
        var e = entitylist!!.get(0)
        entitylist!!.removeAt(0)
        slot!!.memorize(entitylist)
        entity!!.memorize(e)

        logger.debug("Popped: $e")

        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
