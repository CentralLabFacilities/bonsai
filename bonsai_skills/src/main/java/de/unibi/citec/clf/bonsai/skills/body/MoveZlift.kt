package de.unibi.citec.clf.bonsai.skills.body

import de.unibi.citec.clf.bonsai.actuators.JointControllerActuator
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import java.util.concurrent.Future
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Change the zlift position.
 *
 * <pre>
 *
 * Options:
 *  #_POSITION:      [Double] Optional (Default: 0)
 *                      -> Z lift position, range depending on the robot (Tiago: 0.0-0.35)
 *  #_MOVE_DURATION: [Integer] Optional (Default: 4000)
 *                      -> Time the lift takes to move to the position in milliseconds
 *  #_TIMEOUT:       [Integer] Optional (default: 7000)
 *                      -> Amount of time robot waits for actuator to be done in milliseconds
 *  #_SLOT:          [boolean] Optional (default: false)
 *                      -> If true the position is read from a slot
 *
 * Slots:
 *
 * ExitTokens:
 *  success:    z-lift movement completed successfully
 *  error
 *
 * Sensors:
 *
 * Actuators:
 *  ZliftActuator
 *
 * </pre>
 *
 * TODO: unmekafy
 *
 * @author llach
 */
class MoveZlift: AbstractSkill() {

    private var jointcontroller: JointControllerActuator? = null

    private var tokenSuccess: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var pos = 0f
    private var move_duration = 4000
    private var timeout: Long = 7000

    private var b: Future<Boolean>? = null

    private var heightSlot: MemorySlotReader<Double>? = null

    @Throws(SkillConfigurationException::class)
    override fun configure(configurator: ISkillConfigurator) {

        jointcontroller = configurator.getActuator("ZLiftActuator", JointControllerActuator::class.java)

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())

        move_duration = configurator.requestOptionalInt(KEY_MOVE_DURATION, move_duration)
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()

        if (configurator.hasConfigurationKey(KEY_POSITION)) {
            pos = configurator.requestDouble(KEY_POSITION).toFloat()
        } else {
            heightSlot = configurator.getReadSlot("ZLiftHeight", Double::class.java)
        }
    }

    override fun init(): Boolean {
        pos = heightSlot?.recall<Double>()?.toFloat() ?: run {
            pos
        }

        b = jointcontroller!!.moveTo(pos, 1000.0f / move_duration)

        if (timeout > 0) {
            timeout += Time.currentTimeMillis()
        }

        return true
    }

    override fun execute(): ExitToken {
        return if (!b!!.isDone) {
            if (timeout > 0 && timeout < Time.currentTimeMillis()) {
                tokenError!!
            } else ExitToken.loop(50)
        } else tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        b?.cancel(true)
        return curToken
    }

    companion object {
        private const val KEY_POSITION = "#_POSITION"
        private const val KEY_MOVE_DURATION = "#_MOVE_DURATION"
        private const val KEY_TIMEOUT = "#_TIMEOUT"
    }
}
