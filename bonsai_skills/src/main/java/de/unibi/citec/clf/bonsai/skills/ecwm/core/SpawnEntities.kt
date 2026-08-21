package de.unibi.citec.clf.bonsai.skills.ecwm.core

import de.unibi.citec.clf.bonsai.actuators.WorldModel
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.EntityList
import java.util.concurrent.Future
/**
 * Add entities to the world
 * <pre>
 *
 * Options:
 * LIST                    [boolean] Optional (default: false)
 *      -> Specifies whether to add a single Entity or a list of Entities.
 *      -> If false, the Entity slot is used.
 *      -> If true, the EntitiesIn slot is used.
 *
 * Slots:
 * Entity: [Entity] (Read, Conditional)
 *      -> Memory slot containing the Entity to be added to the world model.
 *      -> Used when LIST is false.
 *
 * EntitiesIn: [EntityList] (Read, Conditional)
 *      -> Memory slot containing the list of Entities to be added to the
 *         world model.
 *      -> Used when LIST is true.
 *
 * ExitTokens:
 * success: Entities successfully added to the world model
 *
 * Sensors:
 *
 * Actuators:
 *  ECWMCore: [WorldModel]
 *      -> Used to add the Entities to the world model.
 *
 * </pre>
 *
 * @author
 */
class SpawnEntities : AbstractSkill() {

    private var tokenSuccess: ExitToken? = null

    private var entitySlot: MemorySlotReader<Entity>? = null
    private var entityListSlot: MemorySlotReader<EntityList>? = null

    private var ecwm: WorldModel? = null

    private var fur: Future<Boolean?>? = null

    private var all = false;


    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        ecwm = configurator.getActuator("ECWMCore", WorldModel::class.java)

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
