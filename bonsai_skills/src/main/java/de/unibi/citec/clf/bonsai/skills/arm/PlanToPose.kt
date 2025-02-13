package de.unibi.citec.clf.bonsai.skills.arm

import de.unibi.citec.clf.bonsai.actuators.PostureActuator
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import java.util.concurrent.Future
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Arm moves to the pose given in the Key #_POSE.
 *
 * grasp_up, fold_up, carry_side, home
 *
 * @author lruegeme
 */
class PlanToPose : AbstractSkill() {

    companion object {
        private const val KEY_ACTUATOR = "#_ACTUATOR"
        private const val KEY_CHOOSE_GROUP = "#_CHOOSE_GROUP"
        private const val KEY_GROUP = "#_GROUP"
        private const val KEY_POSE = "#_POSE"
        private const val KEY_UPRIGHT = "#_UPRIGHT"
    }
    // used tokens
    private var tokenSuccess: ExitToken? = null

    // defaults
    private var pose: String = ""
    private var group = "arm"
    private var actName = "PostureActuator"
    private var upright = false

    private var poseAct: PostureActuator? = null
    private var success: Future<Boolean>? = null

    private var groupSlot: MemorySlotReader<String>? = null

    override fun configure(configurator: ISkillConfigurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        actName = configurator.requestOptionalValue(KEY_ACTUATOR,actName)
        poseAct = configurator.getActuator(actName, PostureActuator::class.java)

        pose = configurator.requestValue(KEY_POSE)
        upright = configurator.requestOptionalBool(KEY_UPRIGHT, upright)

        if (configurator.hasConfigurationKey(KEY_GROUP)) {
            group = configurator.requestValue(KEY_GROUP)
        } else {
            val useSlot = configurator.requestOptionalBool(KEY_CHOOSE_GROUP, false)
            if (useSlot) {
                groupSlot = configurator.getReadSlot("GroupSlot", String::class.java)
                logger.info("using group slot!")
            }
        }
    }

    override fun init(): Boolean {
        group = groupSlot?.recall<String>() ?: group
        logger.info("MoveTo: $pose[$group] (upright:$upright)")
        success = poseAct!!.moveTo(pose, group, upright)
        return success != null
    }

    override fun execute(): ExitToken {
        if (!success!!.isDone) {
            return ExitToken.loop(50)
        }

        return if( success!!.get()) {
            tokenSuccess!!
        } else {
            logger.fatal("moveTo did not succeed")
            ExitToken.fatal()
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }

}
