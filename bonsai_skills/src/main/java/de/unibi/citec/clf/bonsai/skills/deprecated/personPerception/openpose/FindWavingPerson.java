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
 * Tobi will look for a waving person and store its position in a
 * NavigationGoalSlot.
 *
 *
 * @author rfeldhans
 */
public class FindWavingPerson extends AbstractSkill {

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

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccessNotFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("notFound"));
        tokenSuccessFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("found"));


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
        }

        globalGoal = getWavingPersonPosition();

        if (globalGoal == null) {
            return tokenSuccessNotFound;
        }*/
        return tokenSuccessFound;
    }

    NavigationGoalData getWavingPersonPosition() {

        double minDist = Double.POSITIVE_INFINITY;
        boolean found = false;
        /*
        BodySkeleton closest = new BodySkeleton();
        for (BodySkeleton spookySkeleton : peopleList) {
            if (spookySkeleton.getWaving()) {
                found = true;
                logger.debug("Person: " + spookySkeleton.toString() + "\nDist: " + spookySkeleton.getDistanceToRobot() + " Center of Mass: " + spookySkeleton.calculateCenterOfMass());
                double dist = spookySkeleton.getDistanceToRobot();
                if (minDist > dist) {
                    minDist = dist;
                    closest = spookySkeleton;
                }
            }
        }*/
        return null;
        /*
        if (found) {
            return createNavGoal(closest.getPosition());
        } else {
            return null;
        }*/
    }

    NavigationGoalData createNavGoal(Point2D pos) {
        PositionData closestPos = new PositionData(pos.getX(LengthUnit.METER), pos.getY(LengthUnit.METER),
                0, robotPos.getTimestamp(), LengthUnit.METER, AngleUnit.RADIAN);
        closestPos.setYaw(closestPos.getRelativeAngle(closestPos, AngleUnit.RADIAN), AngleUnit.RADIAN);
        PositionData closestGlobalPos = CoordinateSystemConverter.localToGlobal(closestPos, robotPos);
        //NavigationGoalData  bla = new NavigationGoalData(closestGlobalPos);

        double distance = robotPos.getDistance(closestGlobalPos, LengthUnit.METER);
        double angle = robotPos.getRelativeAngle(closestGlobalPos, AngleUnit.RADIAN);
        logger.error("Distance: " + distance + " Angle " + angle);
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
