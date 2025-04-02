package de.unibi.citec.clf.bonsai.strategies.drive

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator
import de.unibi.citec.clf.bonsai.core.`object`.Sensor
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import de.unibi.citec.clf.bonsai.strategies.drive.DriveStrategy.StrategyState
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter
import de.unibi.citec.clf.btl.data.navigation.*
import de.unibi.citec.clf.btl.data.navigation.PositionData.ReferenceFrame
import de.unibi.citec.clf.btl.units.AngleUnit
import de.unibi.citec.clf.btl.units.LengthUnit
import org.apache.log4j.Logger
import java.io.IOException
import java.lang.Exception
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future
import kotlin.math.abs

/**
 * This drive strategy tries goals on line of sight from the robot to the target
 * goal (nearest goals to the target first).
 *
 * @author cklarhor
 */
abstract class DriveStrategyWithTryGoal(
    nav: NavigationActuator,
    robotPositionSensor: Sensor<PositionData>?, conf: ISkillConfigurator
) : DriveStrategy {
    @JvmField
    protected val logger: Logger = Logger.getLogger(this.javaClass)
    private val robotPositionSensor: Sensor<PositionData>?
    @JvmField
    protected var targetGoal: NavigationGoalData? = null
    @JvmField
    protected val nav: NavigationActuator
    @JvmField
    protected var maxDistanceSuccess: Double = 0.0
    protected var yawTolerance: Double = 0.0
    @JvmField
    protected var robotPos: PositionData? = null
    private var lastCommandResult: Future<CommandResult>? = null
    private var lastRobotPos: PositionData? = null

    protected var correctYaw: Boolean = true
    @JvmField
    protected var takeGoal: Int = 1
    @JvmField
    protected var replan: Int = 3
    @JvmField
    protected var closerSteps: Int = 1
    @JvmField
    protected var closerStepSize: Double = 0.11
    @JvmField
    protected var closerMaxSteps: Double = 4.0
    protected var minDistanceSuccess: Double = 0.1

    private var progressLastPose: PositionData? = null
    private var progressLastTime: Long = 0L
    private var progressMinDist = 0.05
    private var progressMinYaw = 0.2
    private var progressMaxTime = 3000L

    fun checkProgress(current: PositionData) : Boolean  {
        if(progressLastPose == null) {
            progressLastPose = current
            progressLastTime = Time.currentTimeMillis()
            return true
        }

        val dist = progressLastPose!!.distance(current)
        val angleDelta = abs(progressLastPose!!.getYaw(AngleUnit.RADIAN) - current.getYaw(AngleUnit.RADIAN))
        if(dist > progressMinDist || angleDelta > progressMinYaw) {
            logger.debug("made drive progress")
            progressLastPose = current
            progressLastTime = Time.currentTimeMillis()
            return true
        }

        if(Time.currentTimeMillis() > progressLastTime + progressMaxTime) {
            logger.warn("no drive progress in the last ${progressMaxTime}ms")
            return false
        }

        return true
    }

    override fun init(pTargetGoal: NavigationGoalData): Boolean {
        targetGoal = pTargetGoal
        updateRobotPosition()
        if (pTargetGoal == null) {
            logger.fatal("targetGoal is null")
            return false
        } else if (ReferenceFrame.fromString(pTargetGoal.frameId) == ReferenceFrame.LOCAL) {
            val pos = CoordinateSystemConverter.localToGlobal(pTargetGoal, robotPos)
            targetGoal!!.setX(pos.getX(LengthUnit.METER), LengthUnit.METER)
            targetGoal!!.setY(pos.getY(LengthUnit.METER), LengthUnit.METER)
            targetGoal!!.setYaw(pos.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN)
            targetGoal!!.setCoordinateTolerance(maxDistanceSuccess, LengthUnit.METER)
        }
        try {
            nav.clearCostmap()
        } catch (e: IOException) {
            logger.error("Error while clearing costmap")
            return false
        }
        targetGoal!!.setCoordinateTolerance(maxDistanceSuccess, LengthUnit.METER)
        return true
    }

    init {
        configure(conf)
        this.robotPositionSensor = robotPositionSensor
        this.nav = nav
    }

    @Throws(SkillConfigurationException::class)
    private fun configure(conf: ISkillConfigurator) {
        maxDistanceSuccess = conf.requestOptionalDouble(MAX_DISTANCE_SUCCESS_KEY, DEFAULT_MAX_DISTANCE_SUCCESS)
        yawTolerance = conf.requestOptionalDouble(YAW_TOLERANCE_KEY, DEFAULT_YAW_TOLERANCE)
        replan = conf.requestOptionalInt(REPLAN, replan)
        correctYaw = conf.requestOptionalBool(KET_CORRECT_YAW, correctYaw)
        progressMaxTime = conf.requestOptionalInt(KEY_NOT_MOVED_TIME, progressMaxTime.toInt()).toLong()
        progressMinDist = conf.requestOptionalDouble(KEY_NOT_MOVED_MIN_DIST, progressMinDist)
        progressMinYaw = conf.requestOptionalDouble(KEY_NOT_MOVED_MIN_YAW, progressMinYaw)
    }

    private fun updateRobotPosition() {
        try {
            robotPos = robotPositionSensor!!.readLast(200)
            if (robotPos == null) {
                logger.error("not read from position sensor")
                robotPos = robotPositionSensor.readLast(1000)
            }
        } catch (ex: IOException) {
            logger.error(ex)
        } catch (ex: InterruptedException) {
            logger.error(ex)
        }
        logger.debug("robot positon after update: $robotPos")
    }

    @Throws(IOException::class)
    protected abstract fun findBestGoal(): NavigationGoalData?

    override fun execute(): StrategyState {
        if (this.robotPositionSensor == null) {
            logger.error("Robot position sensor is null")
            return StrategyState.ERROR
        }
        try {
            if (targetGoal == null) {
                logger.error("No Target goal")
                return StrategyState.ERROR
            }
            if (lastCommandResult != null && !lastCommandResult!!.isDone) {
                val currentPose = robotPositionSensor.readLast(200) ?: run {
                    throw Exception("could not update robot position")
                }
                if(!checkProgress(currentPose)) {
                    return StrategyState.NOT_MOVED
                }
                // logger.debug("Not done driving....");
                // logger.debug("lastCommandResult Timestamp: " + lastCommandResult.get().getTimestamp());
                logger.trace("not done driving")
                return StrategyState.NOT_FINISHED
            }

            if (lastCommandResult != null) {
                logger.debug("lastCommandResult Timestamp: " + lastCommandResult!!.get().timestamp)
            }
            lastRobotPos = robotPos
            updateRobotPosition()
            if (robotPos == null) {
                logger.error("RobotSensor returned null")
                return StrategyState.ERROR
            }
            logger.debug("find new goal for target: $targetGoal")
            val actualBestGoal = findBestGoal()
            if (actualBestGoal == null) {
                if (checkSuccess()) {
                    logger.debug("i am in success distance, correcting yaw and returning success")
                    if (correctYaw) correctYaw()
                    return StrategyState.SUCCESS
                } else {
                    logger.debug("not in success distance returning error")
                    return StrategyState.ERROR
                }
            } else {
                if (checkMinSuccess()) {
                    if (correctYaw) correctYaw()
                    return StrategyState.SUCCESS
                }
                driveTo(actualBestGoal)
                if (robotPos!!.getDistance(lastRobotPos, LengthUnit.METER) < 0.05) {
                    ++takeGoal
                    logger.debug("Robot did not move. Trying $takeGoal to last plan step")
                }
                return StrategyState.NOT_FINISHED
            }
        } catch (e: ExecutionException) {
            logger.error(e)
            return StrategyState.ERROR
        } catch (e: InterruptedException) {
            logger.error(e)
            return StrategyState.ERROR
        } catch (e: IOException) {
            logger.error(e)
            return StrategyState.ERROR
        }
    }

    private fun checkMinSuccess(): Boolean {
        return (robotPos!!.getDistance(targetGoal, LengthUnit.METER) < minDistanceSuccess)
    }

    @Throws(InterruptedException::class, ExecutionException::class)
    private fun correctYaw() {
        updateRobotPosition()
        val yawDiff = targetGoal!!.getYaw(AngleUnit.RADIAN) - robotPos!!.getYaw(AngleUnit.RADIAN)
        logger.debug(
            "Target Goal Yaw: " + targetGoal!!.getYaw(AngleUnit.RADIAN) + "   robotPos Yaw: " + robotPos!!.getYaw(
                AngleUnit.RADIAN
            )
        )

        val t = TurnData()
        t.setAngle(yawDiff, AngleUnit.RADIAN)
        var result: Future<CommandResult?>? = null
        try {
            result = nav.moveRelative(DriveData(), t)
        } catch (e: IOException) {
            throw ExecutionException(e)
        }
        while (!result.isDone) {
            Thread.sleep(50)
        }
    }

    override fun reset() {
        try {
            nav.manualStop()
        } catch (ex: IOException) {
            logger.error("Could not stop navigation actuator", ex)
        }
    }

    @Throws(ExecutionException::class)
    private fun driveTo(goal: NavigationGoalData) {
        logger.debug("drive to: $goal")
        when (ReferenceFrame.fromString(goal.frameId)) {
            ReferenceFrame.GLOBAL -> {
                logger.debug("strategy: GLOBAL")
                val startTime = System.nanoTime()
                try {
                    lastCommandResult = nav.navigateToCoordinate(goal)
                } catch (e: IOException) {
                    throw ExecutionException(e)
                }
                logger.debug("Navigate Call took: " + (System.nanoTime() - startTime))
            }

            ReferenceFrame.LOCAL -> {
                logger.debug("strategy: LOCAL")
                lastCommandResult = nav.navigateRelative(goal)
            }

            else -> {
                logger.error("GoalType not implemented")
                throw ExecutionException("GoalType not impl $goal", null)
            }
        }
    }

    protected abstract fun checkSuccess(): Boolean

    companion object {
        private const val KEY_NOT_MOVED_TIME = "#_NOT_MOVED_TIME"
        private const val KEY_NOT_MOVED_MIN_DIST = "#_MIN_MOVED_DIST"
        private const val KEY_NOT_MOVED_MIN_YAW = "#_MIN_MOVED_YAW"
        private const val KET_CORRECT_YAW = "#_CORRECT_YAW"
        private const val MAX_DISTANCE_SUCCESS_KEY = "#_MAX_DISTANCE_SUCCESS"
        private const val YAW_TOLERANCE_KEY = "#_MAX_YAW_TOLERANCE_SUCCESS"
        private const val REPLAN = "#_REPLAN"
        private const val DEFAULT_MAX_DISTANCE_SUCCESS = 0.1
        private const val DEFAULT_YAW_TOLERANCE = 0.1
    }
}
