package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.actuators.ManipulationActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Entity
import java.util.concurrent.Future

/**
 * Will try to pick up an object.
 * <pre>
 *
 * Options:
 *  entity:         [String] Optional
 *                           -> the name of the entity to be grasped
 * Slots:
 *  Entity: [Entity] (Read optional)
 *      -> the entity to be grasped. Will be used if option "entity" is not set
 *
 * ExitTokens:
 * success:                The object should be successfully grasped
 * success.maybe:          The environment changed during grasping, plan could've been invalid and failed
 * error.no_plan:          Could not plan a grasping motion
 * error.other:            Grasping failed.
 * fatal:                  MoveIt generated an invalid plan or could not execute it
 *
 * Actuators:
 *  ECWMGrasping: [ECWMGraspingActuator]
 *
 * </pre>
 *
 * @author lruegeme
 */

class GraspEntity : AbstractSkill() {

    private val KEY_ENTITY= "entity"
    private val KEY_UPRIGHT = "upright_grasp"
    private val KEY_CARRY_POSE = "carry_pose"
    private val KEY_KEEP_SCENE = "keep_scene"
    private var entityName: String? = null

    private var slot: MemorySlotReader<Entity>? = null

    private var fur: Future<ManipulationActuator.MoveitResult?>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenErrorNoPlan: ExitToken? = null
    private var tokenErrorOther: ExitToken? = null
    private var tokenSuccessMaybe: ExitToken? = null

    private var upright = false
    private var carryPose: String? = null
    private var keep_scene = true

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenSuccessMaybe = configurator.requestExitToken(ExitStatus.SUCCESS().ps("maybe"))
        tokenErrorNoPlan = configurator.requestExitToken(ExitStatus.ERROR().ps("no_plan"))
        tokenErrorOther = configurator.requestExitToken(ExitStatus.ERROR().ps("other"))

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)

        entityName = configurator.requestOptionalValue(KEY_ENTITY, entityName)
        if(entityName == null || entityName == "null") {
            slot = configurator.getReadSlot("Entity", Entity::class.java)
            logger.info("using slot")
        }

        keep_scene = configurator.requestOptionalBool(KEY_KEEP_SCENE, keep_scene)
        upright = configurator.requestOptionalBool(KEY_UPRIGHT,upright)
        carryPose = configurator.requestOptionalValue(KEY_CARRY_POSE,carryPose)

    }

    override fun init(): Boolean {
        val entity = if(entityName == null || entityName == "null") {
            logger.info("recall")
            slot?.recall<Entity>() ?: return false
        } else {
            Entity(entityName!!)
        }

        logger.debug("try to grasp '$entity' ${if(upright) " (upright)"  else ""}  carry pose: '$carryPose'")

        fur = ecwm?.graspEntity(entity,upright, carryPose, keepScene = keep_scene)

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        val result = fur!!.get()

        logger.debug("result: ${result?.name}")

        return when(result) {
            ManipulationActuator.MoveitResult.SUCCESS -> tokenSuccess!!
            ManipulationActuator.MoveitResult.FAILURE -> ExitToken.fatal()
            ManipulationActuator.MoveitResult.PLANNING_FAILED -> tokenErrorNoPlan!!
            ManipulationActuator.MoveitResult.INVALID_MOTION_PLAN -> ExitToken.fatal()
            ManipulationActuator.MoveitResult.MOTION_PLAN_INVALIDATED_BY_ENVIRONMENT_CHANGE -> tokenErrorOther!!
            ManipulationActuator.MoveitResult.CONTROL_FAILED -> ExitToken.fatal()
            null -> ExitToken.fatal()
            else -> tokenErrorOther!!
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        if(curToken.exitStatus.isFatal) fur?.cancel(true)
        return curToken
    }
}
