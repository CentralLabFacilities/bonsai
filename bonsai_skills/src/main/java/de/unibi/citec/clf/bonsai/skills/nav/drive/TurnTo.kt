package de.unibi.citec.clf.bonsai.skills.nav.drive

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.Sensor
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate
import de.unibi.citec.clf.btl.data.navigation.CommandResult
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData
import de.unibi.citec.clf.btl.data.navigation.PositionData
import de.unibi.citec.clf.btl.units.AngleUnit
import de.unibi.citec.clf.btl.units.LengthUnit
import java.util.concurrent.Future

/**
 * Turns the robot to a given navigation goal.
 *
 * <pre>
 *
 * Options:
 * #_TIMEOUT:      [long] Optional (default: -1)
 * -> Skill timeout in ms
 *
 * Slots:
 * NavigationGoalDataSlot: [NavigationGoalData] [Read]
 * -> Navigation goal to turn towards to
 *
 * ExitTokens:
 * success:            Turn successful
 * success.timeout:    Timeout reached (only used when #_TIMEOUT is set)
 * error:              Turn failed or cancelled
 *
 * Sensors:
 * PositionSensor: [PositionData]
 * -> Get current robot position
 *
 * Actuators:
 * NavigationActuator: [NavigationActuator]
 * -> Called to execute drive
 *
</pre> *
 *
 * @author lruegeme, jkummert
 */
class TurnTo<IOException> : AbstractSkill() {
    private var timeout: Long = -1

    private var tokenSuccess: ExitToken? = null
    private var tokenError: ExitToken? = null
    private var tokenSuccessPsTimeout: ExitToken? = null

    private var navigationGoalDataSlot: MemorySlotReader<NavigationGoalData>? = null
    private var navActuator: NavigationActuator? = null
    private var robotPositionSensor: Sensor<PositionData>? = null

    private var navResult: Future<CommandResult>? = null
    private var pos: PositionData? = null
    private var targetGoal: NavigationGoalData? = null


    @Throws(SkillConfigurationException::class)
    override fun configure(configurator: ISkillConfigurator) {
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())
        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator::class.java)
        navigationGoalDataSlot = configurator.getReadSlot("NavigationGoalDataSlot", NavigationGoalData::class.java)
        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData::class.java)
        if (timeout > 0) {
            tokenSuccessPsTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"))
        }
    }

    override fun init(): Boolean {
        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + "ms")
            timeout += Time.currentTimeMillis()
        }

        targetGoal = navigationGoalDataSlot?.recall<NavigationGoalData>() ?: return false
        pos = robotPositionSensor?.readLast(1000) ?: return false


        logger.debug("robot: $pos")
        logger.debug("goal: $targetGoal")

        val local = CoordinateSystemConverter.globalToLocal(targetGoal, pos)
        val polar = PolarCoordinate(local)
        val angle = polar.getAngle(AngleUnit.RADIAN)

        val finalGoal = NavigationGoalData()
        finalGoal.setYawTolerance(0.1, AngleUnit.RADIAN)
        finalGoal.setCoordinateTolerance(1.0, LengthUnit.METER)
        finalGoal.setYaw(angle, AngleUnit.RADIAN)
        finalGoal.setX(pos!!.getX(LengthUnit.METER), LengthUnit.METER)
        finalGoal.setY(pos!!.getY(LengthUnit.METER), LengthUnit.METER)

        navActuator?.manualStop()
        navResult = navActuator?.navigateToCoordinate(finalGoal) ?: return false
        return true
    }

    override fun execute(): ExitToken {
        if (navResult?.isDone != true) {
            if (timeout < Time.currentTimeMillis()) {
                logger.info("TurnTo timed out")
                return tokenSuccessPsTimeout!!
            }
            return ExitToken.loop(50)
        }

        logger.debug("Driving done!")
        return when (navResult!!.get().resultType) {
                CommandResult.Result.SUCCESS -> tokenSuccess!!
                CommandResult.Result.CANCELLED, CommandResult.Result.SUPERSEDED, CommandResult.Result.EMERGENCY_STOPPED, CommandResult.Result.TIMEOUT -> tokenError!!
                else -> {
                    logger.error("nav actuator returned " + navResult!!.get().resultType
                            + "," + navResult!!.get() + "that's currently not really handled")
                    tokenError!!
                }
            }
    }

    override fun end(curToken: ExitToken): ExitToken {
        navActuator?.manualStop()
        return curToken
    }

    companion object {
        private const val KEY_TIMEOUT = "#_TIMEOUT"
    }
}
