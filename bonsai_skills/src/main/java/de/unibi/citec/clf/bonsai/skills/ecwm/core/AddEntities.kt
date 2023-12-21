package de.unibi.citec.clf.bonsai.skills.ecwm.core

import de.unibi.citec.clf.bonsai.actuators.ECWMCore
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.Entity
import de.unibi.citec.clf.btl.data.ecwm.EntityList
import java.util.concurrent.Future

/**
 * Creates a new entity with the given name and type and add it to the world
 */
class AddEntities : AbstractSkill() {

    private var tokenSuccess: ExitToken? = null

    private var entitySlot: MemorySlotReader<Entity>? = null
    private var entityListSlot: MemorySlotReader<EntityList>? = null

    private var ecwm: ECWMCore? = null

    private var fur: Future<Boolean?>? = null

    private var all = false;


    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        ecwm = configurator.getActuator("ECWMCore", ECWMCore::class.java)

        all = configurator.requestOptionalBool("LIST", all)
        if(all) {
            entityListSlot = configurator.getReadSlot("EntitiesIn", EntityList::class.java)
        } else {
            entitySlot = configurator.getReadSlot("Entity", Entity::class.java)
        }

    }

    override fun init(): Boolean {
        var entities = EntityList()

        if(entitySlot != null) {
            entities.add(entitySlot!!.recall<Entity>() ?: return false)
        } else {
            entities.addAll(entityListSlot!!.recall<EntityList>() ?: return false)
        }

        logger.debug("AddEntities $entities")
        fur = ecwm!!.addEntities(entities)

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        var res = fur!!.get()

        return if (res != null && res) tokenSuccess!! else ExitToken.fatal()
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
