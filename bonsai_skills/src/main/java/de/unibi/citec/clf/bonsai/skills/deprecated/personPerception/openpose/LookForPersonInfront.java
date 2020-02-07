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
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Look for a person infront of the robot.
 *
 * @author saschroeder
 */
public class LookForPersonInfront extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccessNotFound;
    private ExitToken tokenSuccessFound;

    /*
     * Slots used by this state.
     */
    private MemorySlot<NavigationGoalData> navigationGoalSlot;
    NavigationGoalData globalGoal;

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

    private static final String KEY_DIST = "#_MAX_DIST";

    private double maxDist = 2.0;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccessNotFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("notFound"));
        tokenSuccessFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("found"));

        maxDist = configurator.requestOptionalDouble(KEY_DIST, maxDist);

        // Initialize slots
        navigationGoalSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        // Initialize actuators
        //detectPeopleActuator = configurator.getActuator("DetectPeopleActuator", DetectPeopleActuator.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {
        logger.debug("Searching Persons");
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
        }*/
        return isPersonInfront();
    }

    private ExitToken isPersonInfront() {
        /*
        for (BodySkeleton spookySkeleton : peopleList) {
            double dist = spookySkeleton.getDistanceToRobot();
            logger.debug("found person in distance " + dist);
            if (maxDist > dist) {
                globalGoal = createNavGoal(spookySkeleton.getPosition());
                return tokenSuccessFound;
            }
        }*/
        return tokenSuccessNotFound;
    }

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
        if (globalGoal == null) {
            return curToken;
        }
        try {
            navigationGoalSlot.memorize(globalGoal);
        } catch (CommunicationException ex) {
            Logger.getLogger(SearchForPerson.class.getName()).log(Level.SEVERE, null, ex);
        }
        return curToken;
    }
}
