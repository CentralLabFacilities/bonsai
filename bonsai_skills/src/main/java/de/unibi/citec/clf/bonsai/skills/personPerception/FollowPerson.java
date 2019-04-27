package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.bonsai.util.helper.PersonHelper;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.navigation.DriveData;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.navigation.TurnData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import de.unibi.citec.clf.btl.units.SpeedUnit;

import java.io.IOException;

/**
 * Follow a given person.
 * <p>
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
    private static final String KEY_ENABLE_NEAREST = "#_ENABLE_NEAREST_TO_OLD";
    private static final String KEY_NEAREST_MAXDIST = "#_NEAREST_TO_OLD_DIST";
    private static final String KEY_UUID = "#_UUID";

    private double nearestToOldDist = 400;
    private boolean useNearestPerson = false;
    private long personLostTimeout = 5000; //200L
    private double stopDistance = 1000; //500
    private double personLostDist = 4000; //2000
    private long newGoalTimeout = -1L;
    private long talkdistance = 2500; //1900
    private long talkdistanceFar = 5000; //1900
    private boolean isFar = false;
    private String slowDownMessage = "Please move slower!";
    private String stopMessage = "Please wait for me to catch up!";
    private String continueMessage = "Please go ahead!";
    private String strategy = "NearestToTarget";

    private ExitToken tokenErrorPersonLost;
    private ExitToken tokenErrorNoGoalTimeout;
    // sets loop frequency to 14hz
    private ExitToken tokenLoopDiLoop = ExitToken.loop(70);

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
    private PositionData lastRobotPosition = null;
    private double currentPersonDistance = 0;
    private long robotPosTimeout;
    private double wiggleAngle = 0.175;
    private boolean alreadyTalked = false;
    private CoordinateTransformer tf;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tf = (CoordinateTransformer) configurator.getTransform();

        stopDistance = configurator.requestOptionalDouble(KEY_STOP_DISTANCE, stopDistance);
        personLostDist = configurator.requestOptionalDouble(KEY_PERSON_LOST_DISTANCE, personLostDist);
        personLostTimeout = configurator.requestOptionalInt(KEY_PERSON_LOST_TIMEOUT, (int) personLostTimeout);
        newGoalTimeout = configurator.requestOptionalInt(KEY_NO_GOAL_TIMEOUT, (int) newGoalTimeout);
        talkdistance = configurator.requestOptionalInt(KEY_TALK_DISTANCE, (int) talkdistance);
        slowDownMessage = configurator.requestOptionalValue(KEY_SLOW_DOWN_MESSAGE, slowDownMessage);
        strategy = configurator.requestOptionalValue(KEY_STRATEGY, strategy);
        useNearestPerson = configurator.requestOptionalBool(KEY_ENABLE_NEAREST,useNearestPerson);
        nearestToOldDist = configurator.requestOptionalDouble(KEY_NEAREST_MAXDIST,nearestToOldDist);

        lastUuid = configurator.requestOptionalValue(KEY_UUID, null);

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
    }

    @Override
    public boolean init() {
        lastPersonFound = Time.currentTimeMillis();
        lastGoalSet = Time.currentTimeMillis();
        lastGoalCheckSuccess = Time.currentTimeMillis();
        robotPosTimeout = Time.currentTimeMillis();

        lastGoalUsed = new NavigationGoalData();

        try {
            personFollow = followPersonSlotRead.recall();
            robotPosition = -1);
        } catch (CommunicationException | InterruptedException | IOException ex) {
            logger.error(ex);
            return false;
        }

        if (robotPosition == null){
            logger.error("No robot position");
            return false;
        }

        if (personFollow == null) {
            logger.error("No person to follow in memory");
            return false;
        }

        lastPersonPosition = new PositionData(personFollow.getPosition());

        if (lastUuid == null) {
            lastUuid = personFollow.getUuid();
        } else {
            logger.info("Ignoring person from slot because UUID to follow was provided: "+lastUuid);
        }

        logger.debug("Following person: " + personFollow.getUuid());
        return true;
    }

    @Override
    public ExitToken execute() {
        robotPosition = getRobotPosition();
        personFollow = findPersonToFollow();

        if (robotPosition == null) {
            logger.warn("Got no robot position");
            return tokenLoopDiLoop;
        }

        if (personFollow == null) {
            return handlePersonMissing();
        }

        if(!alreadyTalked){
            /*try {
                speechActuator.sayAsync("I see you.");
            } catch (IOException e) {
                logger.error(e.getMessage());
            }*/
            alreadyTalked = true;
        }

        if (Time.currentTimeMillis() - lasttalk > 15000) {
            talk();
        }

        if (robotPosTimeout + 5000 < Time.currentTimeMillis()) {
            handleNonMovingRobot();
            return tokenLoopDiLoop;
        }

        lastPersonPosition = new PositionData(personFollow.getPosition());
        if(!lastPersonPosition.getFrameId().equals("map")) {
            try {
                Pose3D global = tf.transform(lastPersonPosition,"map");
                lastPersonPosition.setFrameId("map");
                lastPersonPosition.setX(global.getTranslation().getX(LengthUnit.METER),LengthUnit.METER);
                lastPersonPosition.setY(global.getTranslation().getY(LengthUnit.METER),LengthUnit.METER);
            } catch (TransformException e) {
                logger.error(e);
            }
        }
        lastUuid = personFollow.getUuid();
        lastPersonFound = Time.currentTimeMillis();

        //todo remove global to locat stuff
        try {
            personFollow.setPosition(MathTools.globalToLocal(personFollow.getPosition(), robotPosition));
        } catch (MathTools.MathException ex) {
            //Already in local

        }
        PolarCoordinate polar = new PolarCoordinate(personFollow.getPosition());

        double driveDistance = calculateDriveDistance(polar);

        boolean setAngleOnlyGoal = false;

        logger.info("stopdistance: " + stopDistance + "; personDistance: " + currentPersonDistance + "; drivedistance: " + driveDistance);

        if (currentPersonDistance < stopDistance) {
            setAngleOnlyGoal = true;
            logger.debug("I'm close enough. Turning only");
        }

        NavigationGoalData goal = null;
        if (setAngleOnlyGoal) {
            goal = CoordinateSystemConverter.polar2NavigationGoalData(robotPosition, polar.getAngle(AU), 0, AU, LU);
        } else {
            goal = CoordinateSystemConverter.polar2NavigationGoalData(robotPosition, polar.getAngle(AU), driveDistance, AU, LU);
        }

        if (goal == null) {
            logger.error("goal null, looping");
            return tokenLoopDiLoop;
        }

        goal.setYawTolerance(0.2, AU);
        goal.setCoordinateTolerance(500, LU);

        if (checkSetNewGoal(goal, setAngleOnlyGoal)) {
            logger.info("Goal set" + goal.toString());

            try {
                navActuator.navigateToCoordinate(goal);
            } catch (IOException e) {
                e.printStackTrace();
            }
            lastGoalSet = Time.currentTimeMillis();
        } else {
            if (newGoalTimeout > 0 && Time.currentTimeMillis() > lastGoalSet + newGoalTimeout) {
                logger.debug("no new goal in lastGoalTimeout");

                if (driveDistance > personLostDist) {
                    logger.debug("No new goal in: " + newGoalTimeout + "ms! and I am too far away!");
                    wrapUpPersonLost(robotPosition, lastPersonPosition);
                    return tokenErrorNoGoalTimeout;
                } else {
                    logger.debug("No new goal in: " + newGoalTimeout + "ms!");
                    return tokenErrorPersonLost;
                }
            }
        }
        return tokenLoopDiLoop;
    }

    private boolean checkSetNewGoal(NavigationGoalData goal, boolean withangle) {

        double dist = lastGoalUsed.getDistance(goal, LU);
        double angleDif = Math.abs(lastGoalUsed.getYaw(AU) - goal.getYaw(AU));
        angleDif = angleDif % Math.PI;

        long timeDiff = Time.currentTimeMillis() - lastGoalCheckSuccess;
        boolean newGoalPosition = dist > NEW_GOAL_DISTANCE_THRESHOLD;

        if (withangle) {
            newGoalPosition = newGoalPosition || angleDif > NEW_GOAL_ANGLE_THRESHOLD;
        }
        if (newGoalPosition && timeDiff >= MIN_GOAL_SEND_TIME) {
            lastGoalUsed = goal;
            lastGoalCheckSuccess = Time.currentTimeMillis();
            return true;
        }
        return false;
    }

    private PositionData getRobotPosition() {

        PositionData robot = null;
        try {
            robot = -1);
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read robot position", ex);
        }
        if (robot != null) {
            if (lastRobotPosition != null) {
                if (checkIfRobotMoving()) {
                    robotPosTimeout = Time.currentTimeMillis();
                    lastRobotPosition = robot;
                }
            } else {
                robotPosTimeout = Time.currentTimeMillis();
                lastRobotPosition = robot;
            }
        }
        return robot;
    }

    private PersonData findPersonToFollow() {

        List<PersonData> persons;
        try {
            persons = personSensor.readLast(100);
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read from person sensor", ex);
            return null;
        }
        if (persons == null) {
            logger.warn("no persons found");
            return null;
        }

        if (persons.isEmpty()) {
            logger.warn("########## Person list size is 0 ############");
        }

        for (PersonData person : persons) {

            if (person.getUuid().equals(lastUuid)) {
                logger.debug("person with id " + person.getUuid() + " found");
                return person;
            }
        }

        if(useNearestPerson) {
            return fetchNearestPerson(personFollow,persons);
        }

        logger.debug("person id " + lastUuid + " not found");
        for (PersonData person : persons) {
            logger.debug("person with id " + person.getUuid());
        }

        return null;
    }

    private PersonData fetchNearestPerson(PersonData personFollow, List<PersonData> persons) {
        if(personFollow == null || persons.isEmpty()) return null;

        PersonHelper.sortPersonsByDistance(persons,personFollow.getPosition());
        PersonData candidate = persons.get(0);

        PolarCoordinate polar = new PolarCoordinate(MathTools.localToOther(candidate.getPosition(),personFollow.getPosition()));
        if(polar.getDistance(LengthUnit.MILLIMETER) <= nearestToOldDist) {
            return candidate;
        } else {
            logger.error("no person near old pose, distance " + polar.getDistance(LengthUnit.MILLIMETER));
        }

        return null;

    }

    private void say(String txt){
        try {
            speechActuator.sayAsync(slowDownMessage);
        } catch (IOException ex) {
            logger.fatal(ex);
        }
        lasttalk = Time.currentTimeMillis();
    }

    private void talk() {
        if(personFollow == null) return;

        if (isFar) {
            if(currentPersonDistance < talkdistance) {
                isFar = false;
                say(continueMessage);
            } else {
                say(stopMessage);
            }
        } else if (currentPersonDistance > talkdistance) {
            if(currentPersonDistance > talkdistanceFar) {
                isFar = true;
                say(stopMessage);
            } else {
                say(slowDownMessage);
            }
        }
    }

    

    private ExitToken handlePersonMissing() {

        if (personLostTimeout > 0 && Time.currentTimeMillis() > lastPersonFound + personLostTimeout) {
            logger.info("Person lost for " + personLostTimeout + " ms! Did not find person " + lastUuid);

            wrapUpPersonLost(robotPosition, lastPersonPosition);
            return tokenErrorPersonLost;
        } else {
            return tokenLoopDiLoop;
        }
    }

    private void wrapUpPersonLost(PositionData robotPosition, PositionData followPersonPosition) {

        PolarCoordinate polar;
        if(followPersonPosition.getFrameId().equals(PositionData.ReferenceFrame.GLOBAL.getFrameName())) {
            polar = new PolarCoordinate(MathTools.globalToLocal(followPersonPosition, robotPosition));
        } else {
            polar = new PolarCoordinate(followPersonPosition);
        }


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
        distance = currentPersonDistance - stopDistance;

        if (distance < 0) {
            distance = 0;
        }

        return distance;
    }

    private boolean checkIfRobotMoving() {
        boolean ret = true;
        if(robotPosition!=null && lastRobotPosition!=null){
            if (robotPosition.getDistance(lastRobotPosition, LengthUnit.METER) < 0.05 &&
                    robotPosition.getYaw(AngleUnit.RADIAN) - lastRobotPosition.getYaw(AngleUnit.RADIAN) < 0.02) {
                return false;
            }
        }
        return ret;
    }

    private void handleNonMovingRobot() {
        double directionOfLastSeenPerson = getLastPersonDirection();
        DriveData driveData = new DriveData(0.1, LengthUnit.METER, 0.01, SpeedUnit.METER_PER_SEC);
        TurnData turnData = new TurnData(directionOfLastSeenPerson * wiggleAngle, AngleUnit.RADIAN, 1, RotationalSpeedUnit.RADIANS_PER_SEC);
        wiggleAngle *= -1;
        try {
            navActuator.moveRelative(driveData, null);
        } catch (IOException e) {
            e.printStackTrace();
        }
        logger.info("Wiggle, wiggle, wiggle!");
        robotPosTimeout = Time.currentTimeMillis();
    }

    private double getLastPersonDirection(){
        PositionData posDataLocal;
        if(lastPersonPosition.getFrameId().equals(PositionData.ReferenceFrame.GLOBAL.getFrameName())) {
            posDataLocal = CoordinateSystemConverter.globalToLocal(lastPersonPosition, robotPosition);
        } else {
            posDataLocal = lastPersonPosition;
        }

        return Math.signum(posDataLocal.getYaw(AngleUnit.RADIAN));
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        logger.debug("Lost Person, Stopping nav act.");
        try {
            navActuator.manualStop();
        } catch (IOException e) {
            logger.error("could not manual stop", e);
        }

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
