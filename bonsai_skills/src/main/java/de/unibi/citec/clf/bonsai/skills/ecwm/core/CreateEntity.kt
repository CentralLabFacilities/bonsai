package de.unibi.citec.clf.bonsai.skills.ecwm.core

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.geometry.Point3D
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.geometry.Rotation3D
import de.unibi.citec.clf.btl.data.geometry.Pose2D
import de.unibi.citec.clf.btl.tools.MathTools
import de.unibi.citec.clf.btl.units.LengthUnit

/**
 * Create a new Entity and saves it in a slot.
 * The entity will not be added to the world model
 *
 * Will use slots if option not set
 *
 * <pre>
 *
 * Options:
 *  name:               [String] Entity name
 *  type:               [String] Optional (default: "unknown")
 *  frame_id            [String] Optional (default: "map")
 *  x:                  [double] Optional (default: 0)
 *  y:                  [double] Optional (default: 0)
 *  z:                  [double] Optional (default: 0)
 *
 * Slots:
 *  Entity: [Entity]
 *
 * </pre>
 *
 * @author lruegeme
 */
class CreateEntity : AbstractSkill() {

    private val KEY_NAME = "name"
    private val KEY_TYPE = "type"
    private val KEY_FRAMEID = "frame_id"
    private val KEY_USE_POSITION = "use_position"
    private val KEY_X = "x"
    private val KEY_Y = "y"
    private val KEY_Z = "z"

    private var usePositionData = false
    private var tokenSuccess: ExitToken? = null

    private var nameslot: MemorySlotReader<String>? = null
    private var entitySlot: MemorySlotWriter<Entity>? = null
    private var poseSlot: MemorySlotReader<Pose3D>? = null
    private var positionSlot: MemorySlotReader<Pose2D>? = null

    private lateinit var name: String
    private var frameId = "map"
    private var type = "unknown"
    private var x = 0.0
    private var y = 0.0
    private var z = 0.0
    private var pose = Pose3D()

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        entitySlot = configurator.getWriteSlot("Entity", Entity::class.java)

        frameId = configurator.requestOptionalValue(KEY_FRAMEID, frameId)
        type = configurator.requestOptionalValue(KEY_TYPE, type)
        usePositionData = configurator.requestOptionalBool(KEY_USE_POSITION, usePositionData)

        if (configurator.hasConfigurationKey(KEY_NAME)) {
            name = configurator.requestValue(KEY_NAME)
        } else {
            nameslot = configurator.getReadSlot("EntityName", String::class.java)
        }

        if (configurator.hasConfigurationKey(KEY_X) ||
            configurator.hasConfigurationKey(KEY_Y) ||
            configurator.hasConfigurationKey(KEY_Z)
        ) {
            x = configurator.requestOptionalDouble(KEY_X, x)
            y = configurator.requestOptionalDouble(KEY_Y, y)
            z = configurator.requestOptionalDouble(KEY_Z, z)
        } else {
            if (usePositionData)
                positionSlot = configurator.getReadSlot("PositionData", Pose2D::class.java)
            else
                poseSlot = configurator.getReadSlot("Pose3D", Pose3D::class.java)
        }

    }

    override fun init(): Boolean {
        pose = positionSlot?.recall<Pose2D>()?.let {
            MathTools.positionToPose(it)
        } ?: poseSlot?.recall<Pose3D>() ?: Pose3D(Point3D(x, y, z, LengthUnit.METER), Rotation3D())

        name = nameslot?.recall<String>() ?: name
        return true;
    }

    override fun execute(): ExitToken {

        var entity = Entity(name, type)
        entity.pose = pose
        entity.frameId = frameId

        logger.debug("Create entity: $entity")
        entitySlot?.memorize(entity)

        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
