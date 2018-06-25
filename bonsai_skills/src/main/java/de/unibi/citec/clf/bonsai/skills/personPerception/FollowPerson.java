package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.strategies.drive.DriveStrategy;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.bonsai.util.helper.DriveStrategyBuilder;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 * Follow a given person.
 *
 * <pre>
 *
 * Options:
 *  #_PERSON_LOST_TIMEOUT:      [long] Optional (default: 100)
 *                                  -> Time passed in ms without seeing the person to follow before exiting
 *  #_STOP_DISTANCE:            [double] Optional (default: 500)
 *                                  -> Distance to keep from person to follow in mm
 *  #_PERSON_LOST_DISTANCE:     [double] Optional (default: 2000)
 *                                  -> Distance at which the person is considered lost in mm
 *  #_NO_GOAL_TIMEOUT:          [long] Optional (default: -1)
 *                                  -> Time passed in ms without setting a new goal before exiting
 *  #_TALK_DISTANCE:            [long] Optional (default: 1900)
 *                                  -> Distance in mm at which to ask the person to slow down
 *  #_SLOW_DOWN_MESSAGE:        [String] Optional (default: "Please move slower!")
 *                                  -> Text to say to ask the person to slow down
 *  #_STRATEGY:                 [String] Optional (default: "NearestToTarget")
 *                                  -> Drive strategy to follow person
 *
 * Slots:
 *  FollowPersonSlot:       [PersonData] [Read]
 *      -> Read in person to follow
 *  LastPersonPositionSlot: [PositionData] [Write]
 *      -> Save position where person was last seen
 *  LastGoalSlot:       [NavigationGoalData] [Write]
 *      -> Save the latest navigation goal
 *
 * ExitTokens:
 *  error.personLost:       Cannot find person or person is more than #_PERSON_LOST_DISTANCE away
 *  error.noGoalTimeout:    No goal was set in #_NO_GOAL_TIMEOUT ms
 *
 * Sensors:
 *  PersonSensor:       [PersonDataList]
 *      -> Read in currently seen persons
 *  PositionSensor:     [PositionData]
 *      -> Read current robot position
 *
 * Actuators:
 *  NavigationActuator: [NavigationActuator]
 *      -> Called to execute drive
 *  SpeechActuator:     [SpeechActuator]
 *      -> Used to ask the person to slow down     
 * 
 * </pre>
 *
 * @author lruegeme
 * @author jkummert
 */
public class FollowPerson extends AbstractSkill {

    private static final String KEY_PERSON_LOST_TIMEOUT = "#_PERSON_LOST_TIMEOUT";
    private static final String KEY_STOP_DISTANCE = "#_STOP_DISTANCE";
    private static final String KEY_PERSON_LOST_DISTANCE = "#_PERSON_LOST_DISTANCE";
    private static final String KEY_NO_GOAL_TIMEOUT = "#_NO_GOAL_TIMEOUT";
    private static final String KEY_TALK_DISTANCE = "#_TALK_DISTANCE";
    private static final String KEY_SLOW_DOWN_MESSAGE = "#_SLOW_DOWN_MESSAGE";
    private static final String KEY_STRATEGY = "#_STRATEGY";

    private long personLostTimeout = 200L;
    private double stopDistance = 500;
    private double personLostDist = 2000;
    private long newGoalTimeout = -1L;
    private long talkdistance = 1900;
    private String slowDownMessage = "Please move slower!";
    private String strategy = "NearestToTarget";
    private ExitToken tokenErrorPersonLost;
    private ExitToken tokenErrorNoGoalTimeout;

    private final double NEW_GOAL_DISTANCE_THRESHOLD = 200;
    private final double NEW_GOAL_ANGLE_THRESHOLD = 0.3;
    private final long MIN_GOAL_SEND_TIME = 250;

    private final static LengthUnit LU = LengthUnit.MILLIMETER;
    private final static AngleUnit AU = AngleUnit.RADIAN;

    private MemorySlotReader<PersonData> followPersonSlotRead;
    private MemorySlotWriter<PositionData> lastPersonPositionSlot;
    private MemorySlotWriter<NavigationGoalData> lastGoalSlot;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> posSensor;

    private NavigationActuator navActuator;
    private SpeechActuator speechActuator;

    private PersonData personFollow = null;
    private PositionData lastPersonPosition;
    private String lastUuid;
    private NavigationGoalData lastGoalUsed;

    private long lastPersonFound = 0;
    private long lastGoalSet = 0;
    private long lastGoalCheckSuccess = 0;
    private long lasttalk = 0;

    private PositionData robotPosition = null;
    double currentPersonDistance = 0;
    private DriveStrategy driveStrategy;

    @Override
    public void configure(ISkillConfigurator configurator) {

        stopDistance = configurator.requestOptionalDouble(KEY_STOP_DISTANCE, stopDistance);
        personLostDist = configurator.requestOptionalDouble(KEY_PERSON_LOST_DISTANCE, personLostDist);
        personLostTimeout = configurator.requestOptionalInt(KEY_PERSON_LOST_TIMEOUT, (int) personLostTimeout);
        newGoalTimeout = configurator.requestOptionalInt(KEY_NO_GOAL_TIMEOUT, (int) newGoalTimeout);
        talkdistance = configurator.requestOptionalInt(KEY_TALK_DISTANCE, (int) talkdistance);
        slowDownMessage = configurator.requestOptionalValue(KEY_SLOW_DOWN_MESSAGE, slowDownMessage);
        strategy = configurator.requestOptionalValue(KEY_STRATEGY, strategy);

        if (personLostTimeout > 0) {
            tokenErrorPersonLost = configurator.requestExitToken(ExitStatus.ERROR().ps("personLost"));
        }
        if (newGoalTimeout > 0) {
            tokenErrorNoGoalTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("noGoalTimeout"));
        }

        followPersonSlotRead = configurator.getReadSlot("FollowPersonSlot", PersonData.class);
        lastPersonPositionSlot = configurator.getWriteSlot("LastPersonPositionSlot", PositionData.class);
        lastGoalSlot = configurator.getWriteSlot("LastGoalSlot", NavigationGoalData.class);

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        posSensor = configurator.getSensor("PositionSensor", PositionData.class);

        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);

        driveStrategy = DriveStrategyBuilder.createStrategy(strategy, configurator, navActuator, posSensor);
    }

    @Override
    public boolean init() {

        lastGoalSet = System.currentTimeMillis();
        lastGoalCheckSuccess = System.currentTimeMillis();

        lastGoalUsed = new NavigationGoalData();

        try {
            personFollow = followPersonSlotRead.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read person from memory", ex);
            return false;
        }

        if (personFollow == null) {
            logger.error("No person to follow in memory");
            return false;
        }

        lastPersonPosition = new PositionData(personFollow.getPosition());
        lastUuid = personFollow.getUuid();
        logger.debug("Following person: " + personFollow.getUuid());
        return true;
    }

    @Override
    public ExitToken execute() {
        robotPosition = getRobotPosition();
        personFollow = findPersonToFollow();

        if (robotPosition == null) {
            logger.warn("Got no robot position");
            return ExitToken.loop();
        }

        if (personFollow == null) {
            return handlePersonMissing();
        }

        if (System.currentTimeMillis() - lasttalk > 15000) {
            talk();
        }

        lastPersonPosition = new PositionData(personFollow.getPosition());
        lastUuid = personFollow.getUuid();
        lastPersonFound = System.currentTimeMillis();
        PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(personFollow.getPosition(), robotPosition));

        double distance = calculateDriveDistance(polar);

        boolean setAngleOnlyGoal = false;

        if (currentPersonDistance < stopDistance) {
            setAngleOnlyGoal = true;
            logger.debug("I'm close enough. Turning only");
        }

        NavigationGoalData goal = null;
        if (setAngleOnlyGoal) {
            goal = CoordinateSystemConverter.polar2NavigationGoalData(robotPosition, polar.getAngle(AU), 0, AU, LU);
        } else {
            goal = CoordinateSystemConverter.polar2NavigationGoalData(robotPosition, polar.getAngle(AU), distance, AU, LU);
        }

        if (goal == null) {
            logger.error("goal null, looping");
            return ExitToken.loop(250);
        }

        goal.setYawTolerance(0.2, AU);
        goal.setCoordinateTolerance(500, LU);

        if (checkSetNewGoal(goal, setAngleOnlyGoal)) {
            logger.info("Goal set" + goal.toString());

            navActuator.navigateToCoordinate(goal);
            lastGoalSet = System.currentTimeMillis();
        } else {
            if (newGoalTimeout > 0 && System.currentTimeMillis() > lastGoalSet + newGoalTimeout) {
                logger.debug("no new goal in lastGoalTimeout");

                if (distance > personLostDist) {
                    logger.debug("No new goal in: " + newGoalTimeout + "ms! and I am too far away!");
                    wrapUpPersonLost(robotPosition, lastPersonPosition);
                    return tokenErrorNoGoalTimeout;
                } else {
                    logger.debug("No new goal in: " + newGoalTimeout + "ms!");
                    return tokenErrorPersonLost;
                }
            }
        }
        return ExitToken.loop(50);
    }

    private boolean checkSetNewGoal(NavigationGoalData goal, boolean withangle) {

        double dist = lastGoalUsed.getDistance(goal, LU);
        double angleDif = Math.abs(lastGoalUsed.getYaw(AU) - goal.getYaw(AU));
        angleDif = angleDif % Math.PI;

        long timeDiff = System.currentTimeMillis() - lastGoalCheckSuccess;
        boolean newGoalPosition = dist > NEW_GOAL_DISTANCE_THRESHOLD;

        if (withangle) {
            newGoalPosition = newGoalPosition || angleDif > NEW_GOAL_ANGLE_THRESHOLD;
        }
        if (newGoalPosition && timeDiff >= MIN_GOAL_SEND_TIME) {
            lastGoalUsed = goal;
            lastGoalCheckSuccess = System.currentTimeMillis();
            return true;
        }
        return false;
    }

    private PositionData getRobotPosition() {

        PositionData robot = null;
        try {
            robot = posSensor.readLast(1);
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read robot position", ex);
        }
        return robot;
    }

    private PersonData findPersonToFollow() {

        List<PersonData> persons;
        try {
            persons = personSensor.readLast(-1);
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read from person sensor", ex);
            return null;
        }
        if (persons == null) {
            logger.warn("no persons found");
            return null;
        }

        for (PersonData person : persons) {

            if (person.getUuid().equals(lastUuid)) {
                logger.debug("person with id " + person.getUuid() + " found");
                return person;
            }
        }

        return null;
    }

    private void talk() {
        if (personFollow != null && currentPersonDistance > talkdistance) {
            try {
                speechActuator.sayAsync(slowDownMessage);
            } catch (IOException ex) {
                logger.fatal(ex);
            }
            lasttalk = System.currentTimeMillis();
        }
    }

    private ExitToken handlePersonMissing() {

        if (personLostTimeout > 0 && System.currentTimeMillis() > lastPersonFound + personLostTimeout) {
            logger.info("Person lost! Did not find person " + lastUuid);

            wrapUpPersonLost(robotPosition, lastPersonPosition);
            return tokenErrorPersonLost;
        } else {
            return ExitToken.loop(personLostTimeout);
        }
    }

    private void wrapUpPersonLost(PositionData robotPosition, PositionData followPersonPosition) {

        PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(followPersonPosition, robotPosition));

        double pAngle = polar.getAngle(AU);
        double pDistance = polar.getDistance(LU);
        double distance = (pDistance > stopDistance) ? pDistance - stopDistance : 0;

        NavigationGoalData target = CoordinateSystemConverter.polar2NavigationGoalData(robotPosition, pAngle, distance, AU, LU);
        double yaw = robotPosition.getYaw(AU) + pAngle;
        target.setYaw(yaw, AU);
        target.setYawTolerance(0.4, AU);
        target.setCoordinateTolerance(0.2, LU);
        logger.debug("Setting goal for lost person: " + target.toString());
        try {
            lastGoalSlot.memorize(target);
        } catch (CommunicationException ex) {
            logger.fatal("could not memorize personLost Goal");
        }
    }

    private double calculateDriveDistance(PolarCoordinate polar) {
        double distance;
        currentPersonDistance = polar.getDistance(LU);
        distance = polar.getDistance(LU) - stopDistance;

        if (distance < 0) {
            distance = 0;
        }

        return distance;
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        
        if (lastPersonPosition != null) {
            try {
                lastPersonPositionSlot.memorize(lastPersonPosition);
            } catch (CommunicationException ex) {
                logger.fatal("Could not store last person position", ex);
            }
        }

        return curToken;
    }
}
