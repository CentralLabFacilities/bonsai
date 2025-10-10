package de.unibi.citec.clf.bonsai.skills.ecwm.util

import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.EntityList
import de.unibi.citec.clf.btl.data.geometry.Point3D
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.geometry.Rotation3D
import de.unibi.citec.clf.btl.data.geometry.Pose2D
import de.unibi.citec.clf.btl.units.LengthUnit
import java.io.IOException
import java.util.concurrent.Future

/**
 * Checks if the point defined by the PositionData is inside the given room
 * References Rooms by their names, not by using the Room Entities.
 *
 * <pre>
 *
 * Options:
 * #_TargetRoom:             [String] Optional
 * -> The name of the location to use as a mask. Will not use the slot input if set.
 *
 * Slots:
 * PositionDataSlot:   [Pose2D] [Read]
 * -> The point to check
 * TargetRoomSlot:       [String] [Read] optional
 * -> The name of the location to use as a mask, given that #_TargetRoom is not set
 * CurrentRoomSlot:       [String] [Write] optional
 * -> The name of the current room, if we are inside one
 *
 * ExitTokens:
 * success.inside:     The point is inside the room
 * success.outside:    The point is outside the room
 * success.wrongRoom:  The point is inside a room, but not the requested one
 * error               Either the room could not be found or the slot not read
 *
 * Sensors:
 *
 * Actuators:
 * ECWMSpirit:         [ECWMSpirit]
 * -> ECWMSpirit actuator
 *
</pre> *
 *
 * @author lgraesner
 */
class CheckIfInsideRoom : AbstractSkill() {
    private var tokenSuccessInside: ExitToken? = null
    private var tokenSuccessOutside: ExitToken? = null
    private var tokenSuccessWrongRoom: ExitToken? = null
    private var positionSlot: MemorySlotReader<Pose2D>? = null
    private var targetRoomSlot: MemorySlotReader<String>? = null
    private var currentRoomSlot: MemorySlotWriter<String>? = null
    private var useSlot = false
    private var ecwmSpirit: ECWMSpirit? = null
    private var roomName: String? = null
    private var roomListFuture: Future<EntityList?>? = null
    private var roomEntity: Entity? = null
    private var position: Pose2D? = null
    override fun configure(configurator: ISkillConfigurator) {
        logger.error("Configuring Check Room..")

        tokenSuccessInside = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("inside"))
        tokenSuccessOutside = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("outside"))
        tokenSuccessWrongRoom = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("wrongRoom"))

        ecwmSpirit = configurator.getActuator<ECWMSpirit>("ECWMSpirit", ECWMSpirit::class.java)

        positionSlot = configurator.getReadSlot<Pose2D>("PositionDataSlot", Pose2D::class.java)
        roomName = configurator.requestOptionalValue(KEY_ROOM, "")
        if (roomName == "") {
            useSlot = true
            targetRoomSlot = configurator.getReadSlot<String>("TargetRoomSlot", String::class.java)
        }
        currentRoomSlot = configurator.getWriteSlot<String>("CurrentRoomSlot", String::class.java)
    }

    override fun init(): Boolean {
        logger.error("Initializing Check Room..")
        position = positionSlot?.recall<Pose2D>() ?: run {
            logger.debug("error reading position from slot")
            return false
        }

        if (useSlot) {
            roomName = targetRoomSlot?.recall<String>() ?: run {
                logger.error("error reading room name from slot")
                return false
            }
        }

        if (position == null) {
            logger.error("position is null")
            return false
        }

        val translation = Point3D(
            position!!.getX(LengthUnit.MILLIMETER),
            position!!.getY(LengthUnit.MILLIMETER),
            0.0,
            LengthUnit.MILLIMETER
        )
        val pose = Pose3D(translation, Rotation3D(), "map")

        try {
            roomListFuture = ecwmSpirit!!.getRoomsOf(pose)
        } catch (e: IOException) {
            logger.error("error getting rooms for pose")
            return false
        }

        return true
    }

    override fun execute(): ExitToken {
        while (!roomListFuture!!.isDone) {
            return ExitToken.loop()
        }

        logger.debug("Executing Check Room..")

        try {
            val roomList = roomListFuture!!.get()
            if (roomList == null) {
                logger.error("error room list is null")
            }
            if (roomList!!.size == 0) return tokenSuccessOutside!!
            roomEntity = roomList[0]
            currentRoomSlot?.memorize(roomEntity!!.id)?: run {
                logger.error("error memorizing current room")
            }
            logger.debug("")


        } catch (ex: Exception) {
            logger.error("Could not fetch rooms for positions.", ex)
        }
        return if (roomEntity!!.id == roomName) {
            tokenSuccessInside!!
        } else {
            tokenSuccessWrongRoom!!
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }

    companion object {
        private const val KEY_ROOM = "#_ROOM"
    }
}