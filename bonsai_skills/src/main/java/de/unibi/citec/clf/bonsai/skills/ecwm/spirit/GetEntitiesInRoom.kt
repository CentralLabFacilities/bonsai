package de.unibi.citec.clf.bonsai.skills.ecwm.spirit

import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.EntityList
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 * Gets all Entities in the given Room
 *
 * <pre>
 *
 * Options:
 *  room:               [String] Optional (default: "")
 *  objects:            [Boolean] Optional include GraspeableObjects (default: False)
 *  rooms:              [Boolean] Optional include Rooms (default: False)
 *
 * Slots:
 *  RoomEntity          [de.unibi.citec.clf.btl.data.world.Entity] Uses this slot to get room if not set with datamodel
 *  EntityList:         [de.unibi.citec.clf.btl.data.world.EntityList]
 *
 * ExitTokens:
 *  success:        Got Entities
 *  error.empty:    No Matching Entities found
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetEntitiesInRoom : AbstractSkill() {

    private val KEY_ENTITY= "room"
    private val KEY_INCLUDE_OBJECTS = "objects"
    private val KEY_INCLUDE_ROOMS = "rooms"

    private var fur: Future<EntityList?>? = null
    private var ecwm: ECWMSpirit? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenEmpty: ExitToken? = null

    private var entities: MemorySlotWriter<EntityList>? = null
    private var entity: MemorySlotReader<Entity>? = null

    private var includeObjects = false
    private var includeRooms = false
    private var entityname: String = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenEmpty = configurator.requestExitToken(ExitStatus.ERROR().ps("empty"))

        entities = configurator.getWriteSlot("EntityList", EntityList::class.java)

        ecwm = configurator.getActuator("ECWMSpirit", ECWMSpirit::class.java)

        if (configurator.hasConfigurationKey(KEY_ENTITY)) {
            entityname = configurator.requestValue(KEY_ENTITY)
        } else {
            entity = configurator.getReadSlot("RoomEntity", Entity::class.java)
        }

        includeObjects = configurator.requestOptionalBool(KEY_INCLUDE_OBJECTS,includeObjects)
        includeRooms = configurator.requestOptionalBool(KEY_INCLUDE_ROOMS,includeRooms)

    }

    override fun init(): Boolean {
        if(entity != null) {
            val e = entity!!.recall<Entity>() ?: return false
            entityname = e.id
        }

        logger.debug("get entities in room '${entityname}' (with objects: $includeObjects) (with rooms: $includeRooms")
        fur = ecwm!!.getEntitiesInRoom(Entity(entityname, ""), includeObjects, includeRooms)

        return true
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        logger.debug("future is done'")

        try {
            fur?.get()?.let {
                if (logger.isDebugEnabled) {
                    logger.debug("Entities in room:")
                    for (e in it) logger.debug(" - $e")
                }
                if (it.isEmpty()) {
                    return tokenEmpty!!
                } else {
                    entities?.memorize(it)
                }
            }
        } catch (e: ExecutionException) {
            logger.error("could not get a goal")
            return ExitToken.fatal();
        }

        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}