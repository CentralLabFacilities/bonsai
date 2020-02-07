package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.openpose;


import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Tobi searches for a person with a specified description. The position of the
 * nearest person matching the description is saved
 *
 *
 * @author jkummert
 */
public class SearchForPerson extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccessNotFound;
    private ExitToken tokenSuccessFound;

    /*
     * Slots used by this state.
     */
    private MemorySlot<NavigationGoalData> navigationGoalSlot;
    NavigationGoalData globalGoal;
    private MemorySlot<String> descriptionSlot;
    String description = "default";

    /*
     * Sensors used by this state.
     */
    private Sensor<PositionData> positionSensor;
    private PositionData robotPos;

    /*
     * Actuators used by this state.
     */
    //private DetectPeopleActuator detectPeopleActuator;

    //List<BodySkeleton> peopleList;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccessNotFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("notFound"));
        tokenSuccessFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("found"));

        // Initialize slots
        navigationGoalSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        descriptionSlot = configurator.getSlot("StringSlot", String.class);

        // Initialize actuators
        //detectPeopleActuator = configurator.getActuator("DetectPeopleActuator", DetectPeopleActuator.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {
        logger.debug("Searching Persons");
        try {
            description = descriptionSlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Could not recall people description");
        }
        try {
            robotPos = positionSensor.readLast(1000);
        } catch (IOException | InterruptedException ex) {
            Logger.getLogger(SearchForPerson.class.getName()).log(Level.SEVERE, null, ex);
        }
        return true;
    }

    @Override
    public ExitToken execute() {
/*
        peopleList = new List(BodySkeleton.class);
        try {
            peopleList = detectPeopleActuator.getPeople();
        } catch (InterruptedException | ExecutionException ex) {
            Logger.getLogger(SearchForPerson.class.getName()).log(Level.SEVERE, null, ex);
        }

        if (peopleList.isEmpty()) {
            return tokenSuccessNotFound;
        }
        if (description == null) {
            description = "default";
        }
        switch (description) {
            case "waving person":
                globalGoal = getGesturePersonPosition(BodySkeleton.Gesture.WAVING);
                break;
            case "calling person":
                globalGoal = getGesturePersonPosition(BodySkeleton.Gesture.WAVING);
                break;
            case "rising left arm person":
                globalGoal = getGesturePersonPosition(BodySkeleton.Gesture.RAISING_LEFT_ARM);
                break;
            case "rising right arm person":
                globalGoal = getGesturePersonPosition(BodySkeleton.Gesture.RAISING_RIGHT_ARM);
                break;
            case "pointing left person":
                globalGoal = getGesturePersonPosition(BodySkeleton.Gesture.POINTING_LEFT);
                break;
            case "pointing right person":
                globalGoal = getGesturePersonPosition(BodySkeleton.Gesture.POINTING_RIGHT);
                break;
            case "sitting person":
                globalGoal = getPosePersonPosition(BodySkeleton.Posture.SITTING);
                break;
            case "standing person":
                globalGoal = getPosePersonPosition(BodySkeleton.Posture.STANDING);
                break;
            case "lying person":
                globalGoal = getPosePersonPosition(BodySkeleton.Posture.LYING);
                break;
            case "man":
            case "boy":
            case "male person":
                globalGoal = getGenderPersonPosition(BodySkeleton.Gender.MALE);
                break;
            case "women":
            case "girl":
            case "female person":
                globalGoal = getGenderPersonPosition(BodySkeleton.Gender.FEMALE);
                break;
            default:
                globalGoal = getAnyPersonPosition();
                break;
        }

        if (globalGoal == null) {
            return tokenSuccessNotFound;
        }*/
        return tokenSuccessFound;
    }
/*
    NavigationGoalData getGesturePersonPosition(BodySkeleton.Gesture gest) {
        double minDist = Double.POSITIVE_INFINITY;
        BodySkeleton closest = new BodySkeleton();
        boolean found = false;
        for (BodySkeleton spookySkeleton : peopleList) {
            if (spookySkeleton.getWaving()) {
                found = true;
                double dist = spookySkeleton.getDistanceToRobot();
                if (minDist > dist) {
                    minDist = dist;
                    closest = spookySkeleton;
                }
            }
        }
        if (found) {
            return createNavGoal(closest.getPosition());
        } else {
            return null;
        }
    }

    NavigationGoalData getPosePersonPosition(BodySkeleton.Posture pose) {
        double minDist = Double.POSITIVE_INFINITY;
        BodySkeleton closest = new BodySkeleton();
        boolean found = false;
        for (BodySkeleton spookySkeleton : peopleList) {
            if (spookySkeleton.getPose().equals(pose)) {
                found = true;
                double dist = spookySkeleton.getDistanceToRobot();
                if (minDist > dist) {
                    minDist = dist;
                    closest = spookySkeleton;
                }
            }
        }
        if (found) {
            return createNavGoal(closest.getPosition());
        } else {
            return null;
        }
    }

    NavigationGoalData getGenderPersonPosition(BodySkeleton.Gender gender) {
        double minDist = Double.POSITIVE_INFINITY;
        BodySkeleton closest = new BodySkeleton();
        boolean found = false;
        for (BodySkeleton spookySkeleton : peopleList) {
            if (spookySkeleton.getGender().equals(gender)) {
                found = true;
                double dist = spookySkeleton.getDistanceToRobot();
                if (minDist > dist) {
                    minDist = dist;
                    closest = spookySkeleton;
                }
            }
        }
        if (found) {
            return createNavGoal(closest.getPosition());
        } else {
            return null;
        }
    }

    NavigationGoalData getAnyPersonPosition() {
        double minDist = Double.POSITIVE_INFINITY;
        BodySkeleton closest = new BodySkeleton();
        boolean found = false;
        for (BodySkeleton spookySkeleton : peopleList) {
            found = true;
            double dist = spookySkeleton.getDistanceToRobot();
            if (minDist > dist) {
                minDist = dist;
                closest = spookySkeleton;
            }
        }
        if (found) {
            return createNavGoal(closest.getPosition());
        } else {
            return null;
        }
    }
*/
    NavigationGoalData createNavGoal(Point2D pos) {
        PositionData closestPos = new PositionData(pos.getX(LengthUnit.METER), pos.getY(LengthUnit.METER),
                0, robotPos.getTimestamp(), LengthUnit.METER, AngleUnit.RADIAN);
        closestPos.setYaw(closestPos.getRelativeAngle(closestPos, AngleUnit.RADIAN), AngleUnit.RADIAN);
        PositionData closestGlobalPos = CoordinateSystemConverter.localToGlobal(closestPos, robotPos);

        double distance = robotPos.getDistance(closestGlobalPos, LengthUnit.METER);
        double angle = robotPos.getRelativeAngle(closestGlobalPos, AngleUnit.RADIAN);
        return globalGoal = CoordinateSystemConverter
                .polar2NavigationGoalData(
                        robotPos,
                        angle,
                        distance,
                        AngleUnit.RADIAN, LengthUnit.METER);
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.equals(tokenSuccessFound)) {
            try {
                navigationGoalSlot.memorize(globalGoal);
            } catch (CommunicationException ex) {
                Logger.getLogger(SearchForPerson.class.getName()).log(Level.SEVERE, null, ex);
            }
        }
        return curToken;
    }

}
