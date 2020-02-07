package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.openpose;


import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.knowledgebase.KBase;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Give certain characteristic of closest person.
 *
 * @author jkummert
 */
public class describePersonOC extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccessNoPeople;
    private ExitToken tokenSuccess;

    /*
     * Slots used by this state.
     */
    private MemorySlot<String> resultSlot;
    String result;

    private MemorySlot<KBase> knowledgeBaseSlot;
    private KBase kbase;

    private MemorySlot<NavigationGoalData> goalSlot;
    private NavigationGoalData goal;

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
    private SpeechActuator speechActuator;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noPeople"));
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        // Initialize slots
        resultSlot = configurator.getSlot("ResultSlot", String.class);

        knowledgeBaseSlot = configurator.getSlot("KBaseSlot", KBase.class);

        goalSlot = configurator.getSlot("NavigationGoal", NavigationGoalData.class);

        // Initialize actuators
        //detectPeopleActuator = configurator.getActuator("DetectPeopleActuator", DetectPeopleActuator.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
    }

    @Override
    public boolean init() {
        logger.debug("Searching Persons for description");
        try {
            robotPos = positionSensor.readLast(1000);
        } catch (IOException | InterruptedException ex) {
            Logger.getLogger(SearchForPerson.class.getName()).log(Level.SEVERE, null, ex);
        }
        try {
            kbase = knowledgeBaseSlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Could not recall kbase");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
/*
        peopleList = new List(BodySkeleton.class);
        try {
            logger.debug("getting people list...");
            peopleList = detectPeopleActuator.getPeople();
            logger.debug("People List gotten.");
        } catch (InterruptedException | ExecutionException ex) {
            Logger.getLogger(describePersonOC.class.getName()).log(Level.SEVERE, null, ex);
        }

        if (peopleList.isEmpty()) {
            return tokenSuccessNoPeople;
        }

        double minDist = Double.POSITIVE_INFINITY;
        BodySkeleton closest = new BodySkeleton();
        for (BodySkeleton spookySkeleton : peopleList) {
            double dist = spookySkeleton.getDistanceToRobot();
            if (minDist > dist) {
                minDist = dist;
                closest = spookySkeleton;
            }
        }
        logger.debug("Closest person is " + closest.toString());

        Point2D personPositionLocal = closest.getPosition();
        Point2D personPositionGlobal = CoordinateSystemConverter.localToGlobal(personPositionLocal, robotPos);
        createNavGoal(personPositionLocal);
        logger.debug("Navgoal created! Preparing report...");

        String report = "I have seen a " + closest.getGender() + ", " + closest.getPose() + " person. ";
        String shirtcolor;
        try {
            shirtcolor = closest.getShirtcolor().getColorName();
        } catch (Exception ex) {
            shirtcolor = "white";
        }

        if (shirtcolor == null || shirtcolor.isEmpty()) {
            shirtcolor = "white";
        }
        String age = closest.getAge();
        if (age != null && !age.isEmpty()) {
            age = age.replace("-", " to ");
        } else {
            age = "17 to 32";
        }
        if (closest.getGender().equals(BodySkeleton.Gender.MALE)) {
            report += "He is" + age + " years old and wears a " + shirtcolor + " shirt. He was by the " + kbase.getArena().getNearestLocation(personPositionGlobal).getName();
        } else {
            report += "She is" + age + " years old and wears a " + shirtcolor + " shirt. She was by the " + kbase.getArena().getNearestLocation(personPositionGlobal).getName();
        }
        logger.debug("Report created: \"" + report + "\". memorizing goal...");

        result = report;
        try {
            goalSlot.memorize(goal);
        } catch (CommunicationException ex) {
            logger.fatal("could not memorize navigationGoal");
        }
*/
        return tokenSuccess;
    }

    NavigationGoalData createNavGoal(Point2D pos) {
        logger.debug("Creating a navgoal from closest person...");
        PositionData closestPos = new PositionData(pos.getX(LengthUnit.METER), pos.getY(LengthUnit.METER),
                0, robotPos.getTimestamp(), LengthUnit.METER, AngleUnit.RADIAN);
        closestPos.setYaw(closestPos.getRelativeAngle(closestPos, AngleUnit.RADIAN), AngleUnit.RADIAN);
        PositionData closestGlobalPos = CoordinateSystemConverter.localToGlobal(closestPos, robotPos);

        double distance = robotPos.getDistance(closestGlobalPos, LengthUnit.METER);
        double angle = robotPos.getRelativeAngle(closestGlobalPos, AngleUnit.RADIAN);
        return goal = CoordinateSystemConverter
                .polar2NavigationGoalData(
                        robotPos,
                        angle,
                        distance,
                        AngleUnit.RADIAN, LengthUnit.METER);
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (result != null) {
            try {
                resultSlot.memorize(result);
            } catch (CommunicationException ex) {
                Logger.getLogger(describePersonOC.class.getName()).log(Level.SEVERE, null, ex);
            }
        }
        return curToken;
    }

}
