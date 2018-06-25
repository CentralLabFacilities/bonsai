package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.map.ViewpointList;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 *
 * @author cklarhorst
 */
public class GuidetoStart extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenErrorPersonLost;
    private ExitToken tokenError;
    private MemorySlot<ViewpointList> memorySlot;
    private MemorySlot<NavigationGoalData> navigationMemorySlot;
    private PositionData navigationGoal;
    private MemorySlot<PersonData> followPersonSlot;
    private NavigationGoalData navData = null;
    private ViewpointList viewpoints;
    private Sensor<PositionData> positionSensor;
    private NavigationActuator navActuator;
    private PersonData personGuide = null;
    private Sensor<PersonDataList> personSensor;
    private SpeechActuator speechActuator;
    private long talkdistance = 1900;

    private PersonData currentPerson = null;
    private double currentPersonDistance = 0;
    private long lasttalk = 0;
    private PositionData robotPosition;

    private static final String KEY_DIRECTION = "#_DIRECTION";
    private static final String KEY_TALK_DISTANCE = "#_TALK_DISTANCE";

    private String direction = "front";
    private long lastGoalTime = 0;
    private PositionData lastRobotPos = null;
    private double lastGoalDistance;
    private double distanceToGoal = 5000;

    //a person has to be this close to continue
    private double maxDist = 1.5;
    //that person has to be behind the robot
    private double maxAngle = 135;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenErrorPersonLost = configurator.requestExitToken(ExitStatus.ERROR().ps("personLost"));
        memorySlot = configurator.getSlot("ViewpointListSlot", ViewpointList.class);
        navigationMemorySlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        followPersonSlot = configurator.getSlot("FollowPersonSlot", PersonData.class);
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);

        direction = configurator.requestOptionalValue(KEY_DIRECTION, direction);
        talkdistance = configurator.requestOptionalInt(KEY_TALK_DISTANCE, (int) talkdistance);
        if (!(direction.equals("front") || direction.equals("left") || direction.equals("right") || direction.equals("back"))) {
            String ex = "direction is: " + direction + "should be front||left||right||back";
            logger.fatal(ex);
            throw new SkillConfigurationException(ex);
        }

    }

    @Override
    public boolean init() {
        try {
            viewpoints = memorySlot.recall();
            if (viewpoints == null) {
                logger.fatal("no Positions saved");
                return false;
            }
            try {
                // check for person to follow from memory
                personGuide = followPersonSlot.recall();
            } catch (CommunicationException ex) {
                logger.warn("Exception while retrieving person to follow from memory!", ex);
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
            logger.debug("tokenSucces : viewpoints = null");
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
            logger.debug("token success navigationGoal = null");
            return tokenSuccess;
        }

        try {
            if (viewpoints.size() > 0) {
                robotPosition = positionSensor.readLast(1000);
                if (lastRobotPos != null && robotPosition != null) {
                    logger.debug("blub");
                }
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
            logger.debug("token Success navigationGoal empty again");
            return tokenSuccess;
        }

        if (robotPosition == null) {
            logger.warn("can't get robot position");
            return tokenError;
        }

        logger.info("Read yaw rad" + navigationGoal.getYaw(AngleUnit.RADIAN));
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
        logger.info("direction: " + direction + "  set yaw rad: " + navigationGoal.getYaw(AngleUnit.RADIAN));
        logger.info("pdata: " + (navigationGoal.toString()));

        currentPerson = findPersonToGuide();
        if (currentPerson == null) {
            return tokenErrorPersonLost;
        }
        NavigationGoalData oldnav = navData;
        navData = new NavigationGoalData(navigationGoal);
        navData.setCoordinateTolerance(1, LengthUnit.METER);
        navData.setYawTolerance(180, AngleUnit.DEGREE);
        navData.setYaw(currentYaw + 180, AngleUnit.DEGREE);
        PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(
                currentPerson.getPosition(), robotPosition));
        currentPersonDistance = polar.getDistance(LengthUnit.MILLIMETER);

        if (lasttalk + 6000 < System.currentTimeMillis()) {
            talk();
        }
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
                } else if (navData != null && viewpoints.size() < 1) {
                    navigationMemorySlot.memorize(navData);
                    memorySlot.memorize(viewpoints);
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

        return curToken;
    }

    private PersonData findPersonToGuide() {

        List<PersonData> persons;
        try {
            persons = personSensor.readLast(500);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Exception while retrieving persons from sensor!", ex);
            return null;
        }
        if (persons == null) {
            logger.warn("no persons found");
            return null;
        }

        for (PersonData person : persons) {
            //we dont care which person is following us as long as a person is following us
            PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(
                    person.getPosition(), robotPosition));

//            // if person too far away
//            if (polar.getDistance(LengthUnit.METER) < maxDist
//                    && (Math.abs(polar.getAngle(AngleUnit.DEGREE))) > maxAngle) {
//                return person;
//            }
            /* unsupported
            if (person.getId() == personGuide.getId()) {
                logger.debug("person with id " + person.getId() + " found");
                return person;
            }
             */
        }

        String personsDebug = "";
        for (PersonData person : persons) {
            // unsupported personsDebug += person.getId() + " ";
        }
        logger.warn("Person not found persons: " + personsDebug);

        return null;
    }

    private void talk() {
        if (currentPerson != null) {
            if (currentPersonDistance > talkdistance) {
                try {
                    speechActuator.sayAsync("Please move faster");
                } catch (IOException ex) {
                    logger.fatal(ex);
                }
                lasttalk = System.currentTimeMillis();
            }
        }
    }

    private boolean nextGoal(long lastGoalTime) {
        logger.debug("lastgoaltime: " + lastGoalTime + " CurrentTime: " + System.currentTimeMillis());
        if (lastGoalTime < (System.currentTimeMillis() - 20000)) {
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
