package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.actuators.ManipulationActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.Entity
import de.unibi.citec.clf.btl.data.geometry.Point3D
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.geometry.Rotation3D
import de.unibi.citec.clf.btl.units.LengthUnit
import java.util.concurrent.Future

/**
 * Will try to place an object somewhere.
 * <pre>
 *
 * Options:
 *      val pose_x: How much the target position should be shifted on the x-axis in m
 *      val pose_y: How much the target position should be shifted on the y-axis in m
 *      val pose_z: How much the target position should be shifted on the z-axis in m
 *      val frame_id: The frame id in which the object should be placed. Previous three variables are relative to it
 *
 *      val acceptable_margin: acceptable margin of error for the placement. Default is 0.15 / 15 cm
 * Slots:
 *  AttachedEntity: [Entity] [Read]
 *      -> the entity to be placed. Must be previously attached to gripper.
 *
 *  TargetPose: [TargetPose] [Read]
 *      -> the target pose in which the entity should be placed
 *
 * ExitTokens:
 * success:                The object should be successfully placed
 * error.no_plan:          Could not plan a placing motion
 * error.other:            Placing failed.
 * fatal:                  MoveIt generated an invalid plan or could not execute it
 *
 * Actuators:
 *  ECWMGrasping: [ECWMGraspingActuator]
 *
 * </pre>
 *
 * @author lruegeme, lseelstrang, klammers
 */

class PlaceEntity : AbstractSkill() {

    private val KEY_POSE_X = "pose_x"
    private val KEY_POSE_Y = "pose_y"
    private val KEY_POSE_Z = "pose_z"
    private val KEY_FRAME_ID = "frame_id"

    private val KEY_ACCEPTABLE_MARGIN = "acceptable_margin"
    private val KEY_UPSIDE_DOWN = "upside_down"

    private var flip = false

//    private val KEY_TARGET_ROT_X = "target_rot_x"
//    private val KEY_TARGET_ROT_Y = "target_rot_y"
//    private val KEY_TARGET_ROT_Z = "target_rot_z"
//    private val KEY_TARGET_ROT_W = "target_rot_w"

    // vars
    private var pose_x : Double? = null
    private var pose_y : Double? = null
    private var pose_z = 0.0

//    private var rotation_x : Double? = null
//    private var rotation_y : Double? = null
//    private var rotation_z : Double? = null
//    private var rotation_w : Double? = null

    lateinit private var  frame_id : String

    private var placement_margin = 0.15
    private var own_margin = false

    private var slot: MemorySlotReader<Entity>? = null
    private var fur: Future<ManipulationActuator.MoveitResult?>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenErrorNoPlan: ExitToken? = null
    private var tokenErrorOther: ExitToken? = null

    private var slotTargetPose: MemorySlotReader<Pose3D>? = null;

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenErrorNoPlan = configurator.requestExitToken(ExitStatus.ERROR().ps("no_plan"))
        tokenErrorOther = configurator.requestExitToken(ExitStatus.ERROR().ps("other"))

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)

        slot = configurator.getReadSlot("AttachedEntity", Entity::class.java)

        if(configurator.hasConfigurationKey(KEY_POSE_X) && configurator.hasConfigurationKey(KEY_POSE_Y)) {
            pose_x = configurator.requestDouble(KEY_POSE_X)
            pose_y = configurator.requestDouble(KEY_POSE_Y)
            frame_id = configurator.requestValue(KEY_FRAME_ID)
            pose_z = configurator.requestOptionalDouble(KEY_POSE_Z, pose_z)
        } else {
            slotTargetPose = configurator.getReadSlot("TargetPose", Pose3D::class.java)
        }

        if(configurator.hasConfigurationKey(KEY_ACCEPTABLE_MARGIN)) {
            placement_margin = configurator.requestOptionalDouble(KEY_ACCEPTABLE_MARGIN, placement_margin)
            own_margin = true
        }
        flip = configurator.requestOptionalBool(KEY_UPSIDE_DOWN, flip)
    }

    override fun init(): Boolean {

        val pose : Pose3D = slotTargetPose?.recall<Pose3D>() ?: Pose3D(Point3D(pose_x!!,pose_y!!,pose_z, LengthUnit.METER), Rotation3D()).apply { frameId = frame_id }
        val entity = slot!!.recall<Entity>() ?: null

        logger.info("place ${entity?.name ?: "object"} @ $pose")

        fur = if (own_margin) {
            val min_dist = Point3D(-placement_margin, -placement_margin, -0.02, LengthUnit.METER)
            val max_dist = Point3D(placement_margin, placement_margin, 0.2, LengthUnit.METER)
            ecwm?.placeEntity(entity, pose, flip, min_dist, max_dist)
        } else {
            ecwm?.placeEntity(entity, pose, flip)
        }
        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        var result = fur!!.get()

        return when(result) {
            ManipulationActuator.MoveitResult.SUCCESS -> tokenSuccess!!
            ManipulationActuator.MoveitResult.FAILURE -> ExitToken.fatal()
            ManipulationActuator.MoveitResult.PLANNING_FAILED -> tokenErrorNoPlan!!
            ManipulationActuator.MoveitResult.INVALID_MOTION_PLAN -> ExitToken.fatal()
            ManipulationActuator.MoveitResult.MOTION_PLAN_INVALIDATED_BY_ENVIRONMENT_CHANGE -> ExitToken.fatal()
            ManipulationActuator.MoveitResult.CONTROL_FAILED -> ExitToken.fatal()
            null -> ExitToken.fatal()
            else -> tokenErrorOther!!
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
