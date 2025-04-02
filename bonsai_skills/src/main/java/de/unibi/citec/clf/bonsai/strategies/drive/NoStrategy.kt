package de.unibi.citec.clf.bonsai.strategies.drive

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator
import de.unibi.citec.clf.bonsai.core.`object`.Sensor
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.strategies.drive.DriveStrategy.StrategyState
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter
import de.unibi.citec.clf.btl.data.navigation.CommandResult
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData
import de.unibi.citec.clf.btl.data.navigation.PositionData
import de.unibi.citec.clf.btl.data.navigation.PositionData.ReferenceFrame
import de.unibi.citec.clf.btl.units.AngleUnit
import de.unibi.citec.clf.btl.units.LengthUnit
import org.apache.log4j.Logger
import java.io.IOException
import java.lang.Exception
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future
import kotlin.math.abs

class NoStrategy(private val nav: NavigationActuator?, private val robotPositionSensor: Sensor<PositionData>?) :
    DriveStrategy {
    private val logger: Logger = Logger.getLogger(this.javaClass)
    private var targetGoal: NavigationGoalData? = null
    private var commandResult: Future<CommandResult>? = null
    private var robotPos: PositionData? = null

    private var progressLastPose: PositionData? = null
    private var progressLastTime: Long = 0L
    private var progressMinDist = 0.05
    private var progressMinYaw = 0.2
    private var progressMaxTime = 3000L

    override fun reset() {
    }

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

    override fun execute(): StrategyState {
        if (commandResult == null) {
            logger.debug("Driving using NoStrategy")
            commandResult = when (ReferenceFrame.fromString(targetGoal!!.frameId)) {
                ReferenceFrame.GLOBAL -> try {
                    nav?.navigateToCoordinate(targetGoal)
                } catch (e: IOException) {
                    logger.error(e)
                    return StrategyState.ERROR
                }

                ReferenceFrame.LOCAL -> nav?.navigateRelative(targetGoal)
                else -> {
                    logger.error("GoalType not implemented")
                    return StrategyState.ERROR
                }
            }
            return StrategyState.NOT_FINISHED
        } else {
            robotPos = robotPositionSensor?.readLast(200) ?: run {
                throw Exception("could not update robot position")
            }
            if(!checkProgress(robotPos!!)) {
                return StrategyState.NOT_MOVED
            }
            if (!commandResult!!.isDone) {
                return StrategyState.NOT_FINISHED
            }
            try {
                when (commandResult!!.get().resultType) {
                    CommandResult.Result.SUCCESS -> return StrategyState.SUCCESS
                    CommandResult.Result.PATH_BLOCKED -> return StrategyState.REACHED_PARTLY
                    else -> {
                        logger.error("nav returned " + commandResult!!.get())
                        return StrategyState.ERROR
                    }
                }
            } catch (e: ExecutionException) {
                logger.error(e)
                return StrategyState.ERROR
            } catch (e: InterruptedException) {
                logger.error(e)
                return StrategyState.ERROR
            }
        }
    }

    override fun init(pTargetGoal: NavigationGoalData): Boolean {
        this.targetGoal = pTargetGoal
        if (robotPositionSensor != null) {
            try {
                robotPos = robotPositionSensor.readLast(1000)
                if (robotPos == null) {
                    logger.error("RobotPosition is null")
                    robotPos = robotPositionSensor.readLast(1000)
                }
            } catch (ex: IOException) {
                logger.error(ex)
            } catch (ex: InterruptedException) {
                logger.error(ex)
            }
        } else {
            logger.error("init(): robotPositionSensor is null")
        }
        if (pTargetGoal == null) {
            logger.fatal("targetGoal is null")
            return false
        } else if (ReferenceFrame.fromString(pTargetGoal.frameId) == ReferenceFrame.LOCAL) {
            val pos = CoordinateSystemConverter.localToGlobal(pTargetGoal, robotPos)
            targetGoal!!.setX(pos.getX(LengthUnit.METER), LengthUnit.METER)
            targetGoal!!.setY(pos.getY(LengthUnit.METER), LengthUnit.METER)
            targetGoal!!.setYaw(pos.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN)
            targetGoal!!.frameId = "map"
        }
        logger.info("init(): targetGoal=$targetGoal, robotPos=$robotPos")
        return true
    }
}
