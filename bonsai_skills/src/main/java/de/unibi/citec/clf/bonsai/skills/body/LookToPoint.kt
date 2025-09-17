package de.unibi.citec.clf.bonsai.skills.body

import de.unibi.citec.clf.bonsai.actuators.GazeActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.geometry.Point3DStamped
import de.unibi.citec.clf.btl.units.LengthUnit
import java.util.concurrent.Future

/**
 * Turn head towards a Pose.
 *
 * @author lruegeme
 */

class LookToPoint : AbstractSkill() {
    private var actuator = "GazeActuator"
    private var blocking = true
    private var duration = 0
    private var tokenSuccess: ExitToken? = null
    private var tokenErrorPsTimeout: ExitToken? = null

    var velocity = 1.0
    var frame = ""
    var x = 0.0
    var y = 0.0
    var z = 0.0
    var timeout = 4000L

    private var gazeActuator: GazeActuator? = null
    private var gazeDone: Future<Void>? = null

    private var slot: MemorySlotReader<Point3DStamped>? = null

    override fun configure(configurator: ISkillConfigurator) {
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()
        duration = configurator.requestOptionalInt(KEY_DURATION, duration)
        velocity = configurator.requestOptionalDouble(KEY_VELOCITY,velocity)
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking)
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        actuator = configurator.requestOptionalValue(KEY_ACTUATOR,actuator)
        gazeActuator = configurator.getActuator(actuator, GazeActuator::class.java)

        val xyzf = setOf(KEY_X, KEY_Y, KEY_Z, KEY_FRAME)
        if (configurator.configurationKeys.any() { it in xyzf}) {
            logger.debug("has configuration for point data, not using slot")
            frame = configurator.requestOptionalValue(KEY_FRAME, frame)
            x = configurator.requestOptionalDouble(KEY_X, x)
            y = configurator.requestOptionalDouble(KEY_Y, y)
            z = configurator.requestOptionalDouble(KEY_Z, z)
        } else {
            slot = configurator.getReadSlot("Point", Point3DStamped::class.java)
        }

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenErrorPsTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"))

    }

    override fun init(): Boolean {
        if (timeout > 0) {
            logger.info("Timeout in ${timeout}ms")
            timeout += Time.currentTimeMillis()
        }

        val pointToLookAt : Point3DStamped = slot?.recall<Point3DStamped>() ?: run {
            logger.debug("slot null, building point from $x, $y, $z in $frame")
            Point3DStamped(x, y, z, LengthUnit.METER, this.frame)
        }
        logger.info("looking at point${pointToLookAt}")
        gazeDone = gazeActuator?.lookAt(pointToLookAt, velocity, duration.toLong())
        return true
    }

    override fun execute(): ExitToken {
        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
                logger.info("LookToPoint timed out")
                return tokenErrorPsTimeout!!
            }
        }

        return if (blocking && !gazeDone!!.isDone) {
            ExitToken.loop(50)
        } else tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        if (blocking) gazeDone?.cancel(true)
        return curToken
    }

    companion object {
        private const val KEY_ACTUATOR = "#_ACTUATOR"
        private const val KEY_TIMEOUT = "#_TIMEOUT"
        private const val KEY_DURATION = "#_MIN_DURATION"
        private const val KEY_VELOCITY = "#_MAX_VELOCITY"
        private const val KEY_BLOCKING = "#_BLOCKING"

        private const val KEY_FRAME = "#_FRAMEID"
        private const val KEY_X = "#_X"
        private const val KEY_Y = "#_Y"
        private const val KEY_Z = "#_Z"
    }
}
