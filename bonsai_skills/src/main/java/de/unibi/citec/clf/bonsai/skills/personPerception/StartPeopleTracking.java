package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.DetectPeopleActuator;
import de.unibi.citec.clf.bonsai.actuators.TrackingActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * StartTracking
 *
 * DOEs 3 things in that order
 * 1: get tracking roi from openpos
 * 2: send tracking roi to tracking
 * 3: wait for personSensor to have first percept and save that as initial personData in slot (might not be needed but is done for sanity)
 *
 * <pre>
 *
 * Options:
 *  #_TIMEOUT_ROI          [long] Optional (default: 10000)
 *      -> Amount of time to wait for roi generation
 *  #_TIMEOUT_TRACKER          [long] Optional (default: 10000)
 *      -> Amount of time to wait for tracker initialisation
 *  #_TIMEOUT_PERSONSENSOR          [long] Optional (default: 10000)
 *      -> Amount of time to wait for first personsensor percept
 *
 * ExitTokens:
 *  error:              cant reach actuators or sensors
 *  error.noPerson:      no person was found
 *  error.timeout.roi:    service call for roi generation timed out
 *  error.timeout.tracker:    service call for tracker initialisation timed out
 *  error.timeout.personSensor:    timed out waiting for initial person percept
 *  success:            all good (all fine) follow can and should be started now
 *
 * Actuators:
 *  DetectPeopleActuator: [DetectPeopleActuator]
 *      -> Called to get roi for following
 *  TrackingActuator: [TrackingActuator]
 *      -> Called to start tracking
 *
 * Sensors:
 *  PersonSensor:       [PersonDataList]
 *      -> Read in currently seen persons
 *
 * </pre>
 *
 *
 * @author pvonneumanncosel
 */
public class StartPeopleTracking extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;
    private ExitToken tokenErrorNoPerson;
    private ExitToken tokenErrorTimeoutRoi;
    private ExitToken tokenErrorTimeoutTracker;
    private ExitToken tokenErrorTimeoutPersonSensor;

    private String KEY_TIMEOUT_ROI = "#_TIMEOUT_ROI";
    private String KEY_TIMEOUT_TRACKER = "#_TIMEOUT_TRACKER";
    private String KEY_TIMEOUT_PERSONSENSOR = "#_TIMEOUT_PERSONSENSOR";

    private DetectPeopleActuator detectPeopleActuator;
    private TrackingActuator trackingActuator;
    private Sensor<PersonDataList> personSensor;
    private MemorySlotWriter<PersonData> personDataSlot;

    private long timeoutRoi = 20000;
    private long timeoutTracker = 20000;
    private long timeoutPersonSensor = 20000;
    private PersonData personData = null;
    private Future<java.util.List<Integer>> roiFut;
    private Future<Boolean> trackingFut;
    private boolean setPersonSensorTimeout = true;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorNoPerson = configurator.requestExitToken(ExitStatus.ERROR().ps("noPerson"));
        tokenErrorTimeoutRoi = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout.roi"));
        tokenErrorTimeoutTracker = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout.tracker"));
        tokenErrorTimeoutPersonSensor = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout.personSensor"));

        detectPeopleActuator = configurator.getActuator("PeopleActuator", DetectPeopleActuator.class);
        trackingActuator = configurator.getActuator("TrackingActuator", TrackingActuator.class);

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);

        personDataSlot = configurator.getWriteSlot("PersonDataSlot", PersonData.class);

        timeoutRoi = configurator.requestOptionalInt(KEY_TIMEOUT_ROI, (int) timeoutRoi);
        timeoutTracker = configurator.requestOptionalInt(KEY_TIMEOUT_TRACKER, (int) timeoutTracker);
        timeoutPersonSensor = configurator.requestOptionalInt(KEY_TIMEOUT_PERSONSENSOR, (int) timeoutPersonSensor);
    }

    @Override
    public boolean init() {
        trackingFut = null;
        setPersonSensorTimeout = true;
        try {
            roiFut = detectPeopleActuator.getFollowROI();
        } catch (InterruptedException | ExecutionException e) {
            logger.error("could nooot reach people actuator ", e);
            return false;
        }

        logger.debug("OPENPOSE SERVICE CALL ROI TRIGGERED");

        if (timeoutRoi > 0) {
            logger.debug("using timeout of " + timeoutRoi + " ms for ROI generation");
            timeoutRoi = timeoutRoi + System.currentTimeMillis();
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeoutRoi > 0 && !roiFut.isDone()) {
            if (System.currentTimeMillis() > timeoutRoi) {
                logger.info("Roi generatin timed out");
                return tokenErrorTimeoutRoi;
            }
        }

        if(!roiFut.isDone()){
            return ExitToken.loop(50);
        }

        //ROI is done now send tracker init service call and wait for future
        if(trackingFut == null){
            try {
                logger.info("OPENPOSE SERVICE CALL ROI RETURNED: " + roiFut.get().get(0) + " " + roiFut.get().get(1) + " " + roiFut.get().get(2) + " " + roiFut.get().get(3));
                //if ROI is 0 0 0 0 == no person
                if(roiFut.get().get(0) == 0 && roiFut.get().get(1) == 0 && roiFut.get().get(2) == 0 && roiFut.get().get(3) == 0){
                    return tokenErrorNoPerson;
                }
                // check width is enough
                if(roiFut.get().get(3) < 80) {
                    int diff = 80-roiFut.get().get(3);
                    roiFut.get().set(0, (int) (roiFut.get().get(0) - diff/2));
                    roiFut.get().set(3, roiFut.get().get(3) + diff);
                }
            } catch (InterruptedException | ExecutionException e) {
                logger.error("could not reach detect people actuator for roi generation service call ", e);
                return tokenError;
            }

            try {
                trackingFut = trackingActuator.startTracking(roiFut.get());
            } catch (InterruptedException | ExecutionException e) {
                logger.error("could not reach tracking actuator ", e);
                return tokenError;
            }

            logger.debug("TRACKER INITALIZE SERVICE CALL TRIGGERED");

            if (timeoutTracker > 0) {
                logger.debug("using timeout of " + timeoutTracker + " ms for Tracker initialization");
                timeoutTracker = timeoutTracker + System.currentTimeMillis();
            }
        }

        if (timeoutTracker > 0 && !trackingFut.isDone()) {
            if (System.currentTimeMillis() > timeoutTracker) {
                logger.info("Tracker initalizaton timed out");
                return tokenErrorTimeoutTracker;
            }
        }

        if(!trackingFut.isDone()){
            return ExitToken.loop(50);
        }

        //flag needed to set timer for waiting for person sensor only once
        if(setPersonSensorTimeout){
            setPersonSensorTimeout = false;
            logger.info("TRACKER INITALIZE SERVICE CALL RETURNED");
            if (timeoutPersonSensor > 0) {
                logger.debug("using timeout of " + timeoutPersonSensor + " ms for wait for initial person from person sensor");
                timeoutPersonSensor = timeoutPersonSensor + System.currentTimeMillis();
            }
            logger.info("WAITING FOR FIRST PERSON IN PERSON SENSOR");
        }

        if (timeoutPersonSensor > 0) {
            if (System.currentTimeMillis() > timeoutPersonSensor) {
                logger.info("Wait for first person from person Sensor timed out");
                return tokenErrorTimeoutPersonSensor;
            }
        }

        if((personData = getPersonFromSensor()) == null){
            return ExitToken.loop(50);
        }

        logger.debug("PERSON SENSOR GOT FIRST PERSON PERCEPT");

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if(personData == null){
                return tokenError;
            }
            try {
                personDataSlot.memorize(personData);
            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return tokenError;
            }
        }
        return curToken;
    }

    private PersonData getPersonFromSensor() {
        List<PersonData> persons;
        try {
            persons = personSensor.readLast(1);

        } catch (IOException | InterruptedException | NullPointerException ex) {
            logger.error("Could not read from person sensor", ex);
            return null;
        }
        if (persons == null) {
            logger.warn("no persons found so far");
            return null;
        }
        if (persons.size() == 0) {
            logger.warn("no persons found so far");
            return null;
        }
        //returning first person in list, because tracker only puplished single persons in the list anyway
        for (PersonData person : persons) {
            person.setUuid("trackedPerson");
            personData = person;
            logger.debug("Got Person from personsensor; custom uuid: " + personData.getUuid() + "; pos: " + personData.getPosition().toString());
            return person;
        }
        return null;
    }
}
