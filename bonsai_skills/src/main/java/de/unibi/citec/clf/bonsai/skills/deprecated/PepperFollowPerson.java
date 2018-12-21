package de.unibi.citec.clf.bonsai.skills.deprecated;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;

/**
 * In this state the robot follows given person.
 *
 * @author lruegeme
 */
public class PepperFollowPerson extends AbstractSkill {

    // used tokens
    private ExitToken tokenErrorPersonLost;
    private ExitToken tokenErrorPersonNotMoved;
    private ExitToken tokenErrorNoGoalTimeout;

    private static final String KEY_PERSON_LOST_TIMEOUT = "#_PERSON_LOST_TIMEOUT";
    private static final String KEY_PERSON_NOT_MOVED_TIMEOUT = "#_PERSON_NOT_MOVED_TIMEOUT";
    private static final String KEY_STOP_DISTANCE = "#_STOP_DISTANCE";
    private static final String KEY_NO_GOAL_TIMEOUT = "#_NO_GOAL_TIMEOUT";
    private static final String KEY_DEBUG = "#_DEBUG";
    private static final String KEY_TALK_DISTANCE = "#_TALK_DISTANCE";
    private static final String KEY_LOOP_WAIT_OBSTACLE = "#_OBSTACLE_WAIT_TIME";

    //defaults
    private boolean debug = false;
    private long personLostTimeout = 100L;
    private long personMovedTimeout = -1L; //UNUSED
    private long newGoalTimeout = -1L;
    private long talkdistance = 1900;
    private double distanceThresholdStop = 500; // 0.7;
    private long obstacleWaitTime = 1000; //UNUSED

    private final static LengthUnit m = LengthUnit.METER;
    private final static AngleUnit rad = AngleUnit.RADIAN;

    private Sensor<List<PersonData>> personSensor;
    private Sensor<PositionData> posSensor;

    private MemorySlot<PersonData> followPersonSlot;
    private NavigationActuator navActuator;
    private SpeechActuator speechActuator;

    private PersonData personFollow = null;
    private long lasttalk = 0;

    private PositionData robotPosition = null;
    private PersonData currentPerson = null;
    double currentPersonDistance = 0;

    /**
     * Default ID of the variable that contains the stop distance.
     * @param configurator
     */
    @Override
    public void configure(ISkillConfigurator configurator) {

        // Initialize sensors
        personSensor = configurator.getSensor("PersonSensor", List.getListClass(PersonData.class));
        posSensor = configurator.getSensor("PositionSensor", PositionData.class);

        // Initialize actuators
        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);
        followPersonSlot = configurator.getSlot("FollowPersonSlot", PersonData.class);
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
        
        obstacleWaitTime = configurator.requestOptionalInt(KEY_LOOP_WAIT_OBSTACLE, (int) obstacleWaitTime);
        distanceThresholdStop = configurator.requestOptionalDouble(KEY_STOP_DISTANCE, distanceThresholdStop);
        personLostTimeout = configurator.requestOptionalInt(KEY_PERSON_LOST_TIMEOUT, (int) personLostTimeout);
        personMovedTimeout = configurator.requestOptionalInt(KEY_PERSON_NOT_MOVED_TIMEOUT, (int) personMovedTimeout);
        newGoalTimeout = configurator.requestOptionalInt(KEY_NO_GOAL_TIMEOUT, (int) newGoalTimeout);
        talkdistance = configurator.requestOptionalInt(KEY_TALK_DISTANCE, (int) talkdistance);
        debug = configurator.requestOptionalBool(KEY_DEBUG, debug);

        if (personLostTimeout > 0) {
            tokenErrorPersonLost = configurator.requestExitToken(ExitStatus.ERROR().ps("personLost"));
        }
        if (personMovedTimeout > 0) {
            tokenErrorPersonNotMoved = configurator.requestExitToken(ExitStatus.ERROR().ps("personNotMoved"));
        }
        if (newGoalTimeout > 0) {
            tokenErrorNoGoalTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("noGoalTimeout"));
        }
    }

    @Override
    public boolean init() {

        try {
            // check for person to follow from memory
            personFollow = followPersonSlot.recall();
        } catch (CommunicationException ex) {
            logger.warn("Exception while retrieving person to follow from memory!", ex);
        }

        if (personFollow == null) {
            logger.error("No person to follow in memory");
            return false;
        }

        logger.info("Following person: " + personFollow.getUuid());
        return true;
    }

    @Override
    public ExitToken execute() {
        // Retrieve sensor data
        robotPosition = getRobotPosition();
        // retrieve current position of the person to follow
        currentPerson = findPersonToFollow();

        if (robotPosition == null) {
            logger.warn("Got no robot position");
            return ExitToken.loop(50);
        }   
        if (currentPerson == null) {
            logger.warn("Got no person position");
            return ExitToken.loop(50);
        }
        
        if(Time.currentTimeMillis() - lasttalk>15000){
            talk();
            
        }

        personFollow = currentPerson;
        
        NavigationGoalData navGoal = new NavigationGoalData();
        navGoal.setX(personFollow.getPosition().getX(m), m);
        navGoal.setY(personFollow.getPosition().getY(m), m);
        //double distance = robotPosition.getDistance(currentPerson.getPosition(), m);
        //double angle = robotPosition.getRelativeAngle(currentPerson.getPosition(), rad);
        //DriveData drive = new DriveData();
        //TurnData turn = new TurnData();
        //drive.setDistance(distance, m);
        //drive.setSpeed(0.5, SpeedUnit.METER_PER_SEC);
        //turn.setAngle(angle, rad);
        //turn.setSpeed(0.5, RotationalSpeedUnit.RADIANS_PER_SEC);
        try {
            navActuator.navigateToCoordinate(navGoal);
        } catch (IOException e) {
            e.printStackTrace();
        }
        return ExitToken.loop(250);

    }

    private PositionData getRobotPosition() {
        PositionData robot = null;
        try {
            robot = posSensor.readLast(5000);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Exception while retrieving robot pos!", ex);
        }
        return robot;
    }

    private PersonData findPersonToFollow() {

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

            if (person.getUuid().equals(personFollow.getUuid())) {
                logger.debug("person with id " + person.getUuid() + " found");
                return person;
            }
        }

        String personsDebug = "";
        for (PersonData person : persons) {
            personsDebug += person.getUuid() + " ";
        }
        logger.warn("Person not found persons: " + personsDebug);

        return null;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (personFollow != null) {
            try {
                followPersonSlot.memorize(personFollow);
            } catch (CommunicationException ex) {
                logger.fatal("store exception", ex);
            }
        }

        return curToken;
    }
    
    private void talk() {
        if (currentPerson != null) {
            if (currentPersonDistance > talkdistance) {
                try {
                    speechActuator.sayAsync("Please move slower");
                } catch (IOException ex) {
                    logger.fatal(ex);
                }
                lasttalk = Time.currentTimeMillis();
            }
        }
    }
}
