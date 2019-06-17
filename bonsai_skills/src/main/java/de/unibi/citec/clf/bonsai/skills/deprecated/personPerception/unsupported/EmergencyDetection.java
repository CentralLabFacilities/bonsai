package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.unsupported;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 * Skill to detect an accident.
 *
 * Returns: success.accident = person got accident (yeah!) success.noPerson = could not find any person (in 5 sec ->
 * LOCAL_TIMEOUT, used to toggle between places, if a person is found but had no accident yet this return will not
 * happen) success.fail = reached timeout (GLOBAL_TIMEOUT reached -> now try other skill to process) error = problem
 * with personSensor, positionSensor,..... fatal = you have lost -.-
 *
 * @author kharmening
 */
public class EmergencyDetection extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessTimeout;
    private ExitToken tokenSuccessNoperson;
    private ExitToken tokenError;
    private ExitToken tokenSuccessAccident;

    /*
     * Sensors used by this state.
     */
    private Sensor<List<PersonData>> personSensor;
    private Sensor<PositionData> positionSensor;

    /**
     * Parameters
     */
//    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_MAX_ANGLE = "#_MAX_ANGLE";
    private static final String KEY_MAX_DISTANCE = "#_MAX_DIST";
    private static final String KEY_DEFAULT_THRESHOLD_STOP = "#_STOP_THRESHOLD";
    private static final String KEY_WITH_PERSON_OF_INTEREST = "#_WITH_PERSON";

    /**
     * default values
     */
    private double default_distance_threshold_stop = 0.4;
    private double max_dist = 4.0;
    private double max_angle = 90;
    private boolean withPersonOfInterest = false;

    /*
     * Actuators used by this state.
     */
    private SpeechActuator speechActuator;

    /*
     * Slots used by this state.
     */
    private MemorySlot<NavigationGoalData> memorySlot;
    private MemorySlot<PositionData> positionDataSlot;
    private MemorySlot<PersonData> personOfInterestSlot;

    /**
     * Variable to store PersonData of the Person to follow.
     */
    private PersonData personOfInterest = null;

    private final String PERSON_FOUND_MESSAGE = "I will observe this person";

    /**
     * Maximum time for this state until it returns
     */
    private static final long GLOBAL_TIMEOUT = 120000;
    /**
     * Counting time for GLOBAL_TIMEOUT
     */
    private static long globalStartTimeEmergencyDetection = -1;

    PositionData position;
    NavigationGoalData globalGoal;

    PositionData lastPosition;

    private static final int NO_PERSON_FOUND = 0;
    private static final int PERSON_FOUND = 1;
    private static final int PERSON_GOT_ACCIDENT = 2;

    private int status = NO_PERSON_FOUND;

    //  private static final int PERSON_MAX_MOVING_DISTANCE = 2000;
    private long localStartTime;
    private final long LOCAL_TIMEOUT = 5000;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("timeout"));
        tokenSuccessNoperson = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noPerson"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccessAccident = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("accident"));

        default_distance_threshold_stop = configurator.requestOptionalDouble(KEY_DEFAULT_THRESHOLD_STOP, default_distance_threshold_stop);
        max_dist = configurator.requestOptionalDouble(KEY_MAX_DISTANCE, max_dist);
        max_angle = configurator.requestOptionalDouble(KEY_MAX_ANGLE, max_angle);
        withPersonOfInterest = configurator.requestOptionalBool(KEY_WITH_PERSON_OF_INTEREST, withPersonOfInterest);

        // Initialize slots
        memorySlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        positionDataSlot = configurator.getSlot("PositionMemorySlot", PositionData.class);
        personOfInterestSlot = configurator.getSlot("PersonOfInterestSlot", PersonData.class);

        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);

        // Initialize sensors
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        personSensor = configurator.getSensor("PersonSensor", List.getListClass(PersonData.class));
    }

    @Override
    public boolean init() {
        localStartTime = Time.currentTimeMillis();
        if (globalStartTimeEmergencyDetection == -1) {
            globalStartTimeEmergencyDetection = Time.currentTimeMillis();
        }

        try {
            // check for person to follow from memory
            personOfInterest = personOfInterestSlot.recall();
        } catch (CommunicationException ex) {
            logger.warn("Exception while retrieving person to follow from memory!", ex);
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (Time.currentTimeMillis() - globalStartTimeEmergencyDetection > GLOBAL_TIMEOUT) {
            if (status == NO_PERSON_FOUND || status == PERSON_FOUND) {
                globalStartTimeEmergencyDetection = -1;
                logger.info("Tried " + GLOBAL_TIMEOUT + "ms detecting an accident, could not detect one");
                return tokenSuccessTimeout;
            }
        }

        //check if WAIT_TIME milliseconds have ellapsed since the skill was started
        if (Time.currentTimeMillis() - localStartTime > LOCAL_TIMEOUT) {
            if (status == NO_PERSON_FOUND) {
                return tokenSuccessNoperson;
            }
        }

        List<PersonData> possiblePersons;
        List<PersonData> allPersons;
        PositionData robotPosition;

        try {
            robotPosition = positionSensor.readLast(200);
            allPersons = personSensor.readLast(200);

            if (withPersonOfInterest) {
                possiblePersons = new List<>(PersonData.class);
                for (PersonData pD : allPersons) {
                    /*
                    if (pD.getId() != personOfInterest.getId()) {
                        possiblePersons.add(pD);
                    } unsupported*/
                }
            } else {
                possiblePersons = allPersons;
            }

        } catch (IOException | InterruptedException ex) {
            logger.error("Error in person/position sensor. ");
            return tokenError;
        }

        if (robotPosition == null) {
            logger.error("Got no robot position");
            return tokenError;
        }

        //check if possiblePersons list is null
        if (possiblePersons == null) {
            if (status == NO_PERSON_FOUND) {
                logger.debug("No Person found (PersonDataList=null) and status was NO_PERSON_FOUND");
                return ExitToken.loop();
            } else {
                logger.debug("status = PERSON_GOT_ACCIDENT!!!");
                status = PERSON_GOT_ACCIDENT;
                return tokenSuccessAccident;
            }
        }

        //check if possiblePersons list is empty
        if (possiblePersons.isEmpty()) {
            if (status == NO_PERSON_FOUND) {
                logger.debug("No Person found (PersonDataList is empty) and status was NO_PERSON_FOUND");
                return ExitToken.loop();
            } else {
                logger.debug("status = PERSON_GOT_ACCIDENT!!!");
                status = PERSON_GOT_ACCIDENT;
                return tokenSuccessAccident;
            }
        }

        // iterate PersonDataList and find person with body and legs
        logger.debug("PersonDataList.size()=" + possiblePersons.size());
        for (PersonData currentPerson : possiblePersons) {

            // check if currentPerson is null
            if (currentPerson == null) {
                continue;
            }

            // check if currentPerson is a person
            /*if (currentPerson.getId() < 0) { unsupported
                continue;
            }*/

            // check if currentPerson has a body and legs
            /* unsupported if (!currentPerson.hasBody() || !currentPerson.hasLegs()) {
                continue;
            }*/

            // now we know that currentPerson IS a person!
            PolarCoordinate polar = new PolarCoordinate(
                    MathTools.globalToLocal(currentPerson.getPosition(), robotPosition));

            logger.debug("person: " + polar.toString());
            //get position of person.
            double distance = polar.getDistance(LengthUnit.METER)
                    - default_distance_threshold_stop;
            if (distance > max_dist) {
                logger.debug("dist to high");
                continue;
            }

            if (distance < 0) {
                logger.debug("angle to high");
                distance = 0;
            }

            if (Math.abs(polar.getAngle(AngleUnit.DEGREE)) > max_angle) {
                continue;
            }

            // get a global goal for the person.
            globalGoal = CoordinateSystemConverter
                    .polar2NavigationGoalData(
                            robotPosition,
                            polar.getAngle(AngleUnit.RADIAN),
                            distance,
                            AngleUnit.RADIAN, LengthUnit.METER);
            double yaw = robotPosition.getYaw(AngleUnit.RADIAN)
                    + polar.getAngle(AngleUnit.RADIAN);
            globalGoal.setYaw(yaw, AngleUnit.RADIAN);

            position = new PositionData(currentPerson.getPosition());

            //unsupported logger.info("Found person: " + currentPerson.getId() + "@" + currentPerson.getPosition());
            if (status == NO_PERSON_FOUND) {
                try {
                    speechActuator.sayAsync(PERSON_FOUND_MESSAGE);

                } catch (IOException ex) {
                    // Not so bad. The robot just says nothing.
                    logger.warn(ex.getMessage());
                }
            }
            logger.info("Set status to PERSON_FOUND");
            status = PERSON_FOUND;
            return ExitToken.loop();
        }
        if (status == NO_PERSON_FOUND) {
            logger.debug("Could not find any person in the PersonList");
            return ExitToken.loop();
        } else {
            logger.debug("status = PERSON_GOT_ACCIDENT!!!");
            status = PERSON_GOT_ACCIDENT;
            return tokenSuccessAccident;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (status == PERSON_GOT_ACCIDENT) {

            globalStartTimeEmergencyDetection = -1;

            // try to memorize global position of found person
            try {
                memorySlot.memorize(globalGoal);
                positionDataSlot.memorize(position);
                return tokenSuccess;
            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }
        return tokenSuccess;
    }
}
