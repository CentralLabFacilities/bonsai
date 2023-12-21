package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.actuators.ManipulationActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.Entity
import java.util.concurrent.Future

/**
 * Will try to place an object somewhere.
 * <pre>
 *
 * Options:
 *      val target: The name of the target entity that gets poured into (e.g. bowl)
 * Slots:
 *  Entity: [Entity] [Read]
 *      -> the entity to be poured into (e.g. bowl). Used if no name was given.
 *
 * ExitTokens:
 * success:                The object should be successfully pouring
 * success.maybe:          The environment changed during pouring, plan could've been invalid and failed
 * error.no_plan:          Could not plan a pouring motion
 * error.other:            Pouring failed.
 * fatal:                  MoveIt generated an invalid plan or could not execute it
 *
 * Actuators:
 *  ECWMGrasping: [ECWMGraspingActuator]
 *
 * </pre>
 *
 * @author lruegeme, jzilke, klammers
 */

class PourInto : AbstractSkill() {

    private val KEY_ENTITY= "target"
    private var entityName: String? = null

    private var slot: MemorySlotReader<Entity>? = null


    private var fur: Future<ManipulationActuator.MoveitResult?>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenErrorNoPlan: ExitToken? = null
    private var tokenErrorOther: ExitToken? = null
    private var tokenSuccessMaybe: ExitToken? = null

    private var keep_scene = true

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenSuccessMaybe = configurator.requestExitToken(ExitStatus.SUCCESS().ps("maybe"))
        tokenErrorNoPlan = configurator.requestExitToken(ExitStatus.ERROR().ps("no_plan"))
        tokenErrorOther = configurator.requestExitToken(ExitStatus.ERROR().ps("other"))

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)

        entityName = configurator.requestOptionalValue(KEY_ENTITY, entityName)
        if(entityName == null || entityName == "null") slot = configurator.getReadSlot("Entity", Entity::class.java)

    }

    override fun init(): Boolean {
        var entity : Entity? = null
        entity = if(entityName == null || entityName == "null") {
            slot?.recall<Entity>() ?: return false
        } else {
            Entity(entityName!!)
        }

        logger.debug("try to pour into $entity")

        fur = ecwm?.pourInto(entity!!)

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        var result = fur!!.get()

        logger.debug("result: ${result?.name}")

        return when(result) {
            ManipulationActuator.MoveitResult.SUCCESS -> tokenSuccess!!
            ManipulationActuator.MoveitResult.FAILURE -> ExitToken.fatal()
            ManipulationActuator.MoveitResult.PLANNING_FAILED -> tokenErrorNoPlan!!
            ManipulationActuator.MoveitResult.INVALID_MOTION_PLAN -> ExitToken.fatal()
            ManipulationActuator.MoveitResult.MOTION_PLAN_INVALIDATED_BY_ENVIRONMENT_CHANGE -> tokenSuccessMaybe!!
            ManipulationActuator.MoveitResult.CONTROL_FAILED -> ExitToken.fatal()
            null -> ExitToken.fatal()
            else -> tokenErrorOther!!
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
