package de.unibi.citec.clf.bonsai.strategies.drive;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.bonsai.util.MapReader;
import de.unibi.citec.clf.btl.data.navigation.CommandResult;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import org.apache.log4j.Logger;

/**
 * This drive strategy tries goals on line of sight from the robot to the target goal (nearest goals to the target
 * first).
 *
 * @author cklarhor
 *
 */
public abstract class DriveStrategyWithTryGoalAndInterrupts implements DriveStrategy {

    private static final String MAX_DISTANCE_SUCCESS_KEY = "#_MAX_DISTANCE_SUCCESS";
    private static final String YAW_TOLERANCE_KEY = "#_MAX_YAW_TOLERANCE_SUCCESS";
    private static final String REPLAN = "#_REPLAN";
    private static final double DEFAULT_MAX_DISTANCE_SUCCESS = 0.5;
    private static final double DEFAULT_YAW_TOLERANCE = 0.1;
    protected final Logger logger = Logger.getLogger(this.getClass());
    private final Sensor<PositionData> robotPositionSensor;
    protected NavigationGoalData targetGoal;
    protected final NavigationActuator nav;

    protected double maxDistanceSuccess;
    protected double yawTolerance;
    protected PositionData robotPos;
    private Future<CommandResult> lastCommandResult;

    protected int takeGoal = 1;
    protected int replan = 3;

    @Override
    public boolean init(NavigationGoalData pTargetGoal) {
        targetGoal = pTargetGoal;
        updateRobotPosition();
        if (pTargetGoal == null) {
            logger.fatal("targetGoal is null");
            return false;
        } else if (PositionData.ReferenceFrame.fromString(pTargetGoal.getFrameId()) == NavigationGoalData.ReferenceFrame.LOCAL) {
            PositionData pos = CoordinateSystemConverter.localToGlobal(pTargetGoal, robotPos);
            targetGoal.setX(pos.getX(LengthUnit.METER), LengthUnit.METER);
            targetGoal.setY(pos.getY(LengthUnit.METER), LengthUnit.METER);
            targetGoal.setYaw(pos.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
            targetGoal.setCoordinateTolerance(maxDistanceSuccess, LengthUnit.METER);
        }
        targetGoal.setCoordinateTolerance(maxDistanceSuccess, LengthUnit.METER);

        return true;
    }

    public DriveStrategyWithTryGoalAndInterrupts(NavigationActuator nav,
            Sensor<PositionData> robotPositionSensor, Map<String, String> variables) throws MapReader.KeyNotFound {
        configure(variables);
        this.robotPositionSensor = robotPositionSensor;
        this.nav = nav;
    }

    private void configure(Map<String, String> variables) throws MapReader.KeyNotFound {
        maxDistanceSuccess = MapReader.readConfigDouble(MAX_DISTANCE_SUCCESS_KEY, DEFAULT_MAX_DISTANCE_SUCCESS, variables);
        yawTolerance = MapReader.readConfigDouble(YAW_TOLERANCE_KEY, DEFAULT_YAW_TOLERANCE, variables);
        replan = MapReader.readConfigInteger(REPLAN, replan, variables);
    }

    protected void updateRobotPosition() {
        try {
            robotPos = robotPositionSensor.readLast(1000);
            if (robotPos == null) {
                logger.error("RobotPosition is null");
                robotPos = robotPositionSensor.readLast(1000);
            }
        } catch (IOException | InterruptedException ex) {
            logger.error(ex);
        }
        logger.debug("robot positon after update: " + robotPos);
    }

    protected abstract NavigationGoalData findBestGoal() throws IOException;

    @Override
    public DriveStrategy.StrategyState execute() {
        try {
            if (targetGoal == null) {
                logger.error("No Target goal");
                return DriveStrategy.StrategyState.ERROR;
            }

            if (lastCommandResult != null && !lastCommandResult.isDone()) {
                logger.debug("Not done driving.");
                logger.debug("lastCommandResult Timestamp: " + lastCommandResult.get().getTimestamp());
                return DriveStrategy.StrategyState.NOT_FINISHED;
            }

            if (lastCommandResult != null
                    && lastCommandResult.get().getResultType() != CommandResult.Result.SUCCESS) {
                logger.error("The last command was not successfull (" + lastCommandResult.get() + ")");
                if (lastCommandResult.get().getResultType() == CommandResult.Result.PATH_BLOCKED) {

                    return DriveStrategy.StrategyState.PATH_BLOCKED;
                }
                return DriveStrategy.StrategyState.ERROR;
            }
            if (lastCommandResult != null) {
                logger.debug("lastCommandResult Timestamp: " + lastCommandResult.get().getTimestamp());
            }
            updateRobotPosition();
            if (robotPos == null) {
                logger.error("RobotSensor returned null");
                return DriveStrategy.StrategyState.ERROR;
            }
            logger.debug("find new goal for target: " + targetGoal);
            NavigationGoalData actualBestGoal = findBestGoal();
            if (actualBestGoal == null) {
                if (checkSuccess()) {
                    logger.debug("i am in success distance, correcting yaw and returning success");
                    correctYaw();
                    return DriveStrategy.StrategyState.SUCCESS;
                } else {
                    logger.debug("not in success distance returning error");
                    return DriveStrategy.StrategyState.ERROR;
                }
            } else {
                if (checkSuccess()) {
                    correctYaw();
                    return DriveStrategy.StrategyState.SUCCESS;
                }
                driveTo(actualBestGoal);
                ++takeGoal;
                logger.debug("Take " + takeGoal + "to last goal");
                return DriveStrategy.StrategyState.NOT_FINISHED;
            }

        } catch (ExecutionException | InterruptedException | IOException e) {
            logger.error(e);
            return DriveStrategy.StrategyState.ERROR;
        }
    }

    private void correctYaw() throws InterruptedException, ExecutionException {
        updateRobotPosition();
        double yawDiff = targetGoal.getYaw(AngleUnit.RADIAN) - robotPos.getYaw(AngleUnit.RADIAN);
        logger.debug("Target Goal Yaw: " + targetGoal.getYaw(AngleUnit.RADIAN) + "   robotPos Yaw: " + robotPos.getYaw(AngleUnit.RADIAN));
        if (Math.abs(yawDiff) < yawTolerance) {
            logger.debug("no yaw correction needed");
            return;
        }
        NavigationGoalData navGoal = new NavigationGoalData("", 0.0, 0.0, yawDiff, NavigationGoalData.ReferenceFrame.LOCAL, LengthUnit.METER, AngleUnit.RADIAN);
        Future<CommandResult> result = nav.navigateRelative(navGoal);
        CommandResult cr = result.get();
        logger.debug("yaw corrected: " + cr.getResultType().name() + "-> " + cr + "turned (Wanted): " + yawDiff);
        updateRobotPosition();
        logger.debug("yaw is now " + robotPos.getYaw(AngleUnit.RADIAN));
    }

    @Override
    public void reset() {
        yawTolerance = 0.0;
        maxDistanceSuccess = 0.0;
    }

    private void driveTo(NavigationGoalData goal) throws ExecutionException {
        logger.debug("drive to: " + goal);
        switch (NavigationGoalData.ReferenceFrame.fromString(goal.getFrameId())) {
            case GLOBAL:
                logger.debug("strategy: GLOBAL");
                long startTime = System.nanoTime();
                lastCommandResult = nav.navigateToInterrupt(goal);
                logger.debug("Navigate Call took: " + (System.nanoTime() - startTime));
                break;
            case LOCAL:
                logger.debug("strategy: LOCAL");
                lastCommandResult = nav.navigateRelative(goal);
                break;
            default:
                logger.error("GoalType not implemented");
                throw new ExecutionException("GoalType not impl " + goal, null);
        }
    }

    protected abstract boolean checkSuccess();

}
