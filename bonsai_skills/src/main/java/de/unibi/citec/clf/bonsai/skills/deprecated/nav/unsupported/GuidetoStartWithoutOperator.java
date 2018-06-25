package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.map.ViewpointList;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 *
 * @author cklarhorst,tschumacher
 */
public class GuidetoStartWithoutOperator extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;
    private MemorySlot<ViewpointList> memorySlot;
    private MemorySlot<NavigationGoalData> navigationMemorySlot;
    private PositionData navigationGoal;
    private NavigationGoalData navData = null;
    private ViewpointList viewpoints;
    private Sensor<PositionData> positionSensor;
    private NavigationActuator navActuator;
    private SpeechActuator speechActuator;

    private PositionData robotPosition;

    private static final String KEY_DIRECTION = "#_DIRECTION";
    private String direction = "front";

    private long skipLastPoint = 0;
    private long lastGoalTime;
    private PositionData lastRobotPos;
    private double distanceToGoal;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        memorySlot = configurator.getSlot("ViewpointListSlot", ViewpointList.class);
        navigationMemorySlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);

    }

    @Override
    public boolean init() {
        try {
            viewpoints = memorySlot.recall();
            if (viewpoints == null) {
                logger.fatal("no Positions saved");
                return false;
            }

            return true;
        } catch (CommunicationException ex) {
            logger.fatal("Memory read failed");
            return false;
        }
    }

    @Override
    public ExitToken execute() {
        navigationGoal = null;
        if (viewpoints == null) {
            logger.debug("tokenSucces : data = null");
            return tokenSuccess;
        }
        try {
            if (viewpoints.size() > 0) {
                navigationGoal = viewpoints.get(viewpoints.size() - 1);
            }
        } catch (IndexOutOfBoundsException e) {
            logger.error("PositionDataList is empty");
            return tokenSuccess;
        }
        if (navigationGoal == null) {
            logger.debug("tokenSucces : posData = null");

            return tokenSuccess;
        }

        try {
            if (viewpoints.size() > 0) {
                robotPosition = positionSensor.readLast(1000);
                if (nextGoal(lastGoalTime) || (navigationGoal.getDistance(robotPosition, LengthUnit.METER) < 0.7)) {

                    lastGoalTime = System.currentTimeMillis();
                    lastRobotPos = robotPosition;
                    distanceToGoal = robotPosition.getDistance(navigationGoal, LengthUnit.METER);

                    viewpoints.remove(viewpoints.size() - 1);
                    logger.info("next navigationGoal(" + viewpoints.size() + ") in range. Remove old goal from list.");
                    navigationGoal = viewpoints.get(viewpoints.size() - 1);

                }
            } else {
                logger.debug("token Success ??");
                return tokenSuccess;
            }
        } catch (IOException | InterruptedException ex) {
            logger.error(ex);
        } catch (IndexOutOfBoundsException e) {
            logger.error("PositionDataList is empty");
        }

        if (navigationGoal == null) {
            logger.debug("tokenSucces : posData = null; again");

            return tokenSuccess;
        }

        //logger.info("Read yaw rad" + posData.getYaw(AngleUnit.RADIAN));
        double currentYaw = navigationGoal.getYaw(AngleUnit.DEGREE);
        switch (direction) {
            case "back":
                navigationGoal.setYaw(currentYaw - 180, AngleUnit.DEGREE);
                break;
            case "left":
                navigationGoal.setYaw(currentYaw + 90, AngleUnit.DEGREE);
                break;
            case "right":
                navigationGoal.setYaw(currentYaw - 90, AngleUnit.DEGREE);
                break;
        }
        //logger.info("direction: " + direction + "  set yaw rad: " + posData.getYaw(AngleUnit.RADIAN));
        //logger.info("pdata: " + (posData.toString()));

        NavigationGoalData oldnav = navData;
        navData = new NavigationGoalData(navigationGoal);
        navData.setCoordinateTolerance(1, LengthUnit.METER);
        navData.setYawTolerance(180, AngleUnit.DEGREE);
        navData.setYaw(currentYaw + 180, AngleUnit.DEGREE);

        if (oldnav != null && navData != null) {
            if (oldnav.getX(LengthUnit.METER) != navData.getX(LengthUnit.METER)) {
                try {
                    logger.info("drive to next goal");
                    navActuator.setGoal(navData);
                } catch (IOException ex) {
                    logger.error("navAcutator is empty");
                    return tokenError;
                }
            }
        } else {
            try {
                logger.info("drive to next goal");
                navActuator.setGoal(navData);
            } catch (IOException ex) {
                logger.error("navAcutator is empty");
                return tokenError;
            }
        }
        logger.debug("loop skill");

        return ExitToken.loop(250);

    }

    @Override
    public ExitToken end(ExitToken curToken) {

        if (getCurrentStatus().isSuccess()) {
            try {
                if (navData != null && viewpoints.size() > 0) {
                    navigationMemorySlot.memorize(navData);
                    viewpoints.remove(viewpoints.size() - 1);
                    memorySlot.memorize(viewpoints);
                    return tokenSuccess;
                } else if (navData != null) {
                    return tokenSuccess;
                }

            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }

        if (getCurrentStatus().isFatal()) {
            return tokenError;
        }
        logger.debug("tokenSucces ...");

        return tokenSuccess;
    }

    private boolean nextGoal(long time) {
        logger.debug("lastgoaltime: " + time + " CurrentTime: " + System.currentTimeMillis());
        if (time < (System.currentTimeMillis() - 20000)) {
            logger.debug("20 seconds passed");
            logger.debug(Math.abs(robotPosition.getDistance(navigationGoal, LengthUnit.METER) - distanceToGoal));
            if (navigationGoal == null || Math.abs(robotPosition.getDistance(navigationGoal, LengthUnit.METER) - distanceToGoal) < 0.02) {
                logger.debug("Robot did not move. Set next nav goal.");
                return true;
            }
        }
        logger.debug("Robot did move. Resume.");
        distanceToGoal = robotPosition.getDistance(navigationGoal, LengthUnit.METER);
        return false;
    }
}
