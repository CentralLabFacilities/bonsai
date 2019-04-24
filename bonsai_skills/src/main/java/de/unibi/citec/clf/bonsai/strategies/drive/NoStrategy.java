package de.unibi.citec.clf.bonsai.strategies.drive;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.navigation.CommandResult;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import org.apache.log4j.Logger;

public class NoStrategy implements DriveStrategy {

    private final Logger logger = Logger.getLogger(this.getClass());
    private final NavigationActuator nav;
    private NavigationGoalData targetGoal;
    private Future<CommandResult> commandResult;
    private PositionData robotPos;
    private Sensor<PositionData> robotPositionSensor;

    public NoStrategy(NavigationActuator nav, Sensor<PositionData> robotPositionSensor) {
        this.nav = nav;
        this.robotPositionSensor=robotPositionSensor;
    }

    @Override
    public void reset() {

    }

    @Override
    public StrategyState execute() {
        if (commandResult == null) {
            logger.debug("Driving using NoStrategy");
            switch (NavigationGoalData.ReferenceFrame.fromString(targetGoal.getFrameId())) {
                case GLOBAL:
                    try {
                        commandResult = nav.navigateToCoordinate(targetGoal);
                    } catch (IOException e) {
                        logger.error(e);
                        return StrategyState.ERROR;
                    }
                    break;
                case LOCAL:
                    commandResult = nav.navigateRelative(targetGoal);
                    break;
                default:
                    logger.error("GoalType not implemented");
                    return StrategyState.ERROR;
            }
            return StrategyState.NOT_FINISHED;
        } else {
            if (!commandResult.isDone()) {
                return StrategyState.NOT_FINISHED;
            }
            try {
                switch (commandResult.get().getResultType()) {
                    case SUCCESS:
                        return StrategyState.SUCCESS;
                    case PATH_BLOCKED:
                        return StrategyState.REACHED_PARTLY;
                    default:
                        logger.error("nav returned " + commandResult.get());
                        return StrategyState.ERROR;
                }
            } catch (ExecutionException | InterruptedException e) {
                logger.error(e);
                return StrategyState.ERROR;
            }
        }

    }

    @Override
    public boolean init(NavigationGoalData pTargetGoal) {
        this.targetGoal = pTargetGoal;
        if(robotPositionSensor!= null) {
            try {
                robotPos = robotPositionSensor.readLast(1000);
                if (robotPos == null) {
                    logger.error("RobotPosition is null");
                    robotPos = robotPositionSensor.readLast(1000);
                }
            } catch (IOException | InterruptedException ex) {
                logger.error(ex);
            }
        } else {
            logger.error("init(): robotPositionSensor is null");
        }
        if (pTargetGoal == null) {
            logger.fatal("targetGoal is null");
            return false;
        } else if (PositionData.ReferenceFrame.fromString(pTargetGoal.getFrameId()) == PositionData.ReferenceFrame.LOCAL) {
            PositionData pos = CoordinateSystemConverter.localToGlobal(pTargetGoal, robotPos);
            targetGoal.setX(pos.getX(LengthUnit.METER), LengthUnit.METER);
            targetGoal.setY(pos.getY(LengthUnit.METER), LengthUnit.METER);
            targetGoal.setYaw(pos.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
            targetGoal.setFrameId("map");
        }
        logger.info("init(): targetGoal="+targetGoal+", robotPos="+robotPos);
        return true;
    }
}
