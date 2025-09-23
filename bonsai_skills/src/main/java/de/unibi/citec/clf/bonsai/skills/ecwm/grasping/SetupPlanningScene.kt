package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping

import java.util.concurrent.Future

/**
 * Setup the planning scene by adding close Entities
 *
 * <pre>
 *
 * Options:
 *  clear:              [Boolean] (Default: true)
 *                  -> clear before adding
 *  clear_attached:     [Boolean] (Default: false)
 *                  -> Also clear attached objects
 *  no_objects:         [Boolean] (Default false)
 *                  -> Do not add graspable objects
 *  distance:           [Double] (Default 2.0)
 *                  -> Max distance to added entities
 *
 * </pre>
 *
 * @author lruegeme, jzilke
 */
class SetupPlanningScene : AbstractSkill() {

    private val KEY_CLEAR= "clear"
    private val KEY_CLEARATTACHED= "clear_attached"
    private val KEY_NO_OBJECTS= "no_objects"
    private val KEY_DISTANCE= "distance"

    private var fur: Future<Boolean>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null

    private var clear = true
    private var clear_attached = false
    private var no_objects = false

    private var distance = 2.0

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)

        clear = configurator.requestOptionalBool(KEY_CLEAR, clear)
        clear_attached = configurator.requestOptionalBool(KEY_CLEARATTACHED, clear_attached)
        distance = configurator.requestOptionalDouble(KEY_DISTANCE,distance)
        no_objects = configurator.requestOptionalBool(KEY_NO_OBJECTS, no_objects)

    }

    override fun init(): Boolean {
        fur = ecwm?.setupPlanningSceneArea(distance.toFloat(),clear,clear_attached, no_objects)

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        return if (fur!!.get()) tokenSuccess!! else ExitToken.fatal()
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
