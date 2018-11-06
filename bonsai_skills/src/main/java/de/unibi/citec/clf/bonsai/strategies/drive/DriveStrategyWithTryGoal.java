package de.unibi.citec.clf.bonsai.strategies.drive;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.navigation.*;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

import org.apache.log4j.Logger;

/**
 * This drive strategy tries goals on line of sight from the robot to the target
 * goal (nearest goals to the target first).
 *
 * @author cklarhor
 *
 */
public abstract class DriveStrategyWithTryGoal implements DriveStrategy {

    private static final String MAX_DISTANCE_SUCCESS_KEY = "#_MAX_DISTANCE_SUCCESS";
    private static final String YAW_TOLERANCE_KEY = "#_MAX_YAW_TOLERANCE_SUCCESS";
    private static final String REPLAN = "#_REPLAN";
    private static final double DEFAULT_MAX_DISTANCE_SUCCESS = 0.1;
    private static final double DEFAULT_YAW_TOLERANCE = 0.1;
    protected final Logger logger = Logger.getLogger(this.getClass());
    private final Sensor<PositionData> robotPositionSensor;
    protected NavigationGoalData targetGoal;
    protected final NavigationActuator nav;
    protected double maxDistanceSuccess;
    protected double yawTolerance;
    protected PositionData robotPos;
    private Future<CommandResult> lastCommandResult;
    private PositionData lastRobotPos;

    protected int takeGoal = 1;
    protected int replan = 3;
    protected int closerSteps = 1;
    protected double closerStepSize = 0.11;
    protected double closerMaxSteps = 4;
    protected double minDistanceSuccess = 0.1;

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
        try {
            nav.clearCostmap();
        } catch (IOException e) {
            logger.error("Error while clearing costmap");
            return false;
        }
        targetGoal.setCoordinateTolerance(maxDistanceSuccess, LengthUnit.METER);
        return true;
    }

    public DriveStrategyWithTryGoal(NavigationActuator nav,
            Sensor<PositionData> robotPositionSensor, ISkillConfigurator conf) throws SkillConfigurationException {
        configure(conf);
        this.robotPositionSensor = robotPositionSensor;
        this.nav = nav;
    }

    private void configure(ISkillConfigurator conf) throws SkillConfigurationException {
        maxDistanceSuccess = conf.requestOptionalDouble(MAX_DISTANCE_SUCCESS_KEY, DEFAULT_MAX_DISTANCE_SUCCESS);
        yawTolerance = conf.requestOptionalDouble(YAW_TOLERANCE_KEY, DEFAULT_YAW_TOLERANCE);
        replan = conf.requestOptionalInt(REPLAN, replan);
    }

    private void updateRobotPosition() {
        try {
            robotPos = robotPositionSensor.readLast(1000);
            if (robotPos == null) {
                logger.error("not read from position sensor");
                robotPos = robotPositionSensor.readLast(1000);
            }
        } catch (IOException | InterruptedException ex) {
            logger.error(ex);
        }
        logger.debug("robot positon after update: " + robotPos);
    }

    protected abstract NavigationGoalData findBestGoal() throws IOException;

    @Override
    public StrategyState execute() {
        if (this.robotPositionSensor == null) {
            logger.error("Robot position sensor is null");
            return StrategyState.ERROR;
        }
        try {
            if (targetGoal == null) {
                logger.error("No Target goal");
                return StrategyState.ERROR;
            }
            if (lastCommandResult != null && !lastCommandResult.isDone()) {
                // logger.debug("Not done driving....");
                // logger.debug("lastCommandResult Timestamp: " + lastCommandResult.get().getTimestamp());
                logger.trace("not done driving");
                return StrategyState.NOT_FINISHED;
            }

            if (lastCommandResult != null) {
                logger.debug("lastCommandResult Timestamp: " + lastCommandResult.get().getTimestamp());
            }
            lastRobotPos = robotPos;
            updateRobotPosition();
            if (robotPos == null) {
                logger.error("RobotSensor returned null");
                return StrategyState.ERROR;
            }
            logger.debug("find new goal for target: " + targetGoal);
            NavigationGoalData actualBestGoal = findBestGoal();
            if (actualBestGoal == null) {
                if (checkSuccess()) {
                    logger.debug("i am in success distance, correcting yaw and returning success");
                    correctYaw();
                    return StrategyState.SUCCESS;
                } else {
                    logger.debug("not in success distance returning error");
                    return StrategyState.ERROR;
                }
            } else {
                if (checkMinSuccess()) {
                    correctYaw();
                    return StrategyState.SUCCESS;
                }
                driveTo(actualBestGoal);
                if (robotPos.getDistance(lastRobotPos, LengthUnit.METER) < 0.05) {
                    ++takeGoal;
                    logger.debug("Robot did not move. Trying " + takeGoal + " to last plan step");
                }
                return StrategyState.NOT_FINISHED;
            }

        } catch (ExecutionException | InterruptedException | IOException e) {
            logger.error(e);
            return StrategyState.ERROR;
        }
    }

    private boolean checkMinSuccess() {
        return (robotPos.getDistance(targetGoal, LengthUnit.METER) < minDistanceSuccess);
    }

    private void correctYaw() throws InterruptedException, ExecutionException {
        updateRobotPosition();
        double yawDiff = targetGoal.getYaw(AngleUnit.RADIAN) - robotPos.getYaw(AngleUnit.RADIAN);
        logger.debug("Target Goal Yaw: " + targetGoal.getYaw(AngleUnit.RADIAN) + "   robotPos Yaw: " + robotPos.getYaw(AngleUnit.RADIAN));

        TurnData t = new TurnData();
        t.setAngle(yawDiff, AngleUnit.RADIAN);
        Future<CommandResult> result = null;
        try {
            result = nav.moveRelative(new DriveData(), t);
        } catch (IOException e) {
            throw new ExecutionException(e);
        }
        while (!result.isDone()) {
            Thread.sleep(50);
        }
    }

    @Override
    public void reset() {
        try {
            nav.manualStop();
        } catch (IOException ex) {
            logger.error("Could not stop navigation actuator", ex);
        }
    }

    private void driveTo(NavigationGoalData goal) throws ExecutionException {
        logger.debug("drive to: " + goal);
        switch (NavigationGoalData.ReferenceFrame.fromString(goal.getFrameId())) {
            case GLOBAL:
                logger.debug("strategy: GLOBAL");
                long startTime = System.nanoTime();
                try {
                    lastCommandResult = nav.navigateToCoordinate(goal);
                } catch (IOException e) {
                    throw new ExecutionException(e);
                }
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
