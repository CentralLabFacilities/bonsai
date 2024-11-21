package de.unibi.citec.clf.bonsai.skills.personPerception.oneshot;

import de.unibi.citec.clf.bonsai.actuators.DetectPeopleActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Look for all visible persons and save them to a personDataSlot.
 * If the are no current visible persons the skill will loop until time out has been reached.
 * Search can be narrowed down by specifying max angle and distance to the person.
 * The yaw of the person position is adjusted to face to the person. for that the robot position has to be written in the correct slot before.
 *
 * You can specify if you also want to do face identification and/or gender and age detection
 * You can also specify the resize out ratio, which affects the speed of the computation and the quality of the skeleton matching
 *
 * <p>
 * ONESHOT
 * <pre>
 *
 * Options:
 *  #_MAX_DIST:         [double] Optional (default: Double.MAX_VALUE)
 *                          -> How far the person can be away from the robot in mm
 *  #_MAX_ANGLE:        [double] Optional (default: Double.MAX_VALUE)
 *                          -> Person must be inside this angle cone in front of the robot in rad
 *  #_DO_FACE_ID:       [int] Optional (default: 1)
 *                          -> Whether face id gets called or not [0 = false, 1 = true]
 *  #_DO_GENDER_AGE:    [int] Optional (default: 1)
 *                          -> Whether gender and age gets called or not [0 = false, 1 = true]
 *  #_RESIZE_OUT_RATION:[double] Optional (default: 8.0)
 *                          -> Affects the speed and the quality of the person detection; values to use:
 *                          4.0 -> quick (approx 2 secs)
 *                          8.0 -> better quality (approx 4 secs)
 *  #_TIMEOUT           [long] Optional (default: -1)
 *                          -> Amount of time robot searches for a person in ms
 *  #_ACTUATOR_TIMEOUT  [long] Optional (default: 30000)
 *                          -> Timeout for a single actuator call in ms
 *
 * Slots:
 *  PersonDataListSlot:             [PersonDataList] [Write]
 *      -> All found persons in a list
 *
 * ExitTokens:
 *  success.people:         There has been at least one person perceived in the given timeout interval satisfying the optional given angle and distance parameters.
 *  success.noPeople:       There has been no person perceived in the given timeout interval satisfying the optional given angle and distance parameters..
 *                           Only if #_TIMEOUT is greater than 0
 *  error:                  There has been an exception while writing to slot or calling the actuator.
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Used to read the current robot position
 *
 * Actuators:
 *  PeopleActuator: [DetectPeopleActuator]
 *      -> Used to detect people
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class SearchPeople extends AbstractSkill {

    private final static String KEY_DISTANCE = "#_MAX_DIST";
    private final static String KEY_ANGLE = "#_MAX_ANGLE";
    private final static String KEY_DO_FACE_ID = "#_DO_FACE_ID";
    private final static String KEY_DO_GENDER_AGE = "#_DO_GENDER_AGE";
    private final static String KEY_RESIZE_OUT_RATION = "#_RESIZE_OUT_RATION";
    private final static String KEY_TIMEOUT = "#_TIMEOUT";
    private final static String KEY_ACTUATOR_TIMEOUT = "#_ACTUATOR_TIMEOUT";

    private double searchRadius = Double.MAX_VALUE;
    private double searchAngle = Double.MAX_VALUE;
    private int do_face_id = 0;
    private int do_gender_age = 0;
    private boolean do_face_id_bool = true;
    private boolean do_gender_age_bool = true;
    private float resize_out_ratio = 8.0f;
    private long search_timeout = -1L;
    private long actuator_timeout = 20000;
    private long current_actuator_timeout;

    private ExitToken tokenSuccessNoPeople;
    private ExitToken tokenSuccessPeople;
    private ExitToken tokenError;

    private DetectPeopleActuator peopleActuator;

    private MemorySlotWriter<PersonDataList> personDataListSlot;

    private Future<PersonDataList> peopleFuture;
    private PersonDataList possiblePersons;

    private PersonDataList foundPersons = new PersonDataList();
    private PositionData robotPosition;

    private Sensor<PositionData> positionSensor;

    @Override
    public void configure(ISkillConfigurator configurator) {
        searchRadius = configurator.requestOptionalDouble(KEY_DISTANCE, searchRadius);
        searchAngle = configurator.requestOptionalDouble(KEY_ANGLE, searchAngle);
        do_face_id = configurator.requestOptionalInt(KEY_DO_FACE_ID, do_face_id);
        do_gender_age = configurator.requestOptionalInt(KEY_DO_GENDER_AGE, do_gender_age);
        resize_out_ratio = (float) configurator.requestOptionalDouble(KEY_RESIZE_OUT_RATION, (double) resize_out_ratio);
        search_timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) search_timeout);
        actuator_timeout = configurator.requestOptionalInt(KEY_ACTUATOR_TIMEOUT, (int) actuator_timeout);

        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noPeople"));
        tokenSuccessPeople = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("people"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personDataListSlot = configurator.getWriteSlot("PersonDataListSlot", PersonDataList.class);


        peopleActuator = configurator.getActuator("PeopleActuator", DetectPeopleActuator.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {
        logger.debug("Scanning for persons ... searchDist:" + searchRadius + " searchAngle:" + searchAngle);
        if (search_timeout > 0) {
            logger.debug("using search timeout of " + search_timeout + " ms");
            search_timeout += Time.currentTimeMillis();
        }
        try {
            robotPosition = positionSensor.readLast(200);
        } catch (IOException | InterruptedException e) {
            logger.error("could not read robot position");
            return false;
        }
        do_face_id_bool = (do_face_id == 1);
        do_gender_age_bool = (do_gender_age == 1);
        logger.debug("Detecting Persons");
        logger.info("Do face id = " + do_face_id_bool + ". Do gender and age = " + do_gender_age_bool + ". Resize Out Ratio = " + resize_out_ratio);

        try {
            possiblePersons = null;
            peopleFuture = peopleActuator.getPeople(do_gender_age_bool, do_face_id_bool, resize_out_ratio);
            current_actuator_timeout = actuator_timeout + Time.currentTimeMillis();
        } catch (InterruptedException | ExecutionException e) {
            logger.error(e);
            return false;
        }
        return true;

    }

    @Override
    public ExitToken execute() {

        if (search_timeout > 0) {
            if (Time.currentTimeMillis() > search_timeout) {
                logger.info("Search for person reached timeout");
                return tokenSuccessNoPeople;
            }
        }

        if (!peopleFuture.isDone()) {
            if (current_actuator_timeout < Time.currentTimeMillis()) {
                return tokenError;
            }
            return ExitToken.loop(50);
        }

        if (possiblePersons == null) {
            try {
                possiblePersons = peopleFuture.get();
            } catch (InterruptedException | ExecutionException e) {
                logger.error("cant access people actuator");
                return tokenError;
            }
        }

        if (possiblePersons == null) {
            logger.warn("Seen persons is null");
            return tokenError;
        }

        if (possiblePersons.isEmpty()) {
            logger.info("Seen no persons");
            return tokenSuccessNoPeople;
        }

        for (PersonData currentPerson : possiblePersons) {
            PositionData localPersonPos = currentPerson.getPosition();
            PositionData globalPersonPos = localPersonPos;
            if(localPersonPos.isInBaseFrame()) {
                globalPersonPos = CoordinateSystemConverter.localToGlobal(localPersonPos, robotPosition);
            }

            logger.info("I saw a person - checking angle now; searchangle= " + searchAngle + ". Local Person position "
                    + localPersonPos.toString() + ". Global Person position " + globalPersonPos.toString());
            logger.info("Persons gesture: " + currentPerson.getPersonAttribute().getGestures().toString());
            double angle = robotPosition.getRelativeAngle(globalPersonPos, AngleUnit.RADIAN);

            if (!(angle > searchAngle / -2 && angle <= 0) && !(angle < Math.PI * -2 + (searchAngle / 2) && angle >= Math.PI * -2)) {
                logger.info("NOT IN SEARCH ANGLE - Person angle " + angle +
                        ". success condition was: " + angle + " < " + searchAngle / 2 + " && " + angle + " < " + (Math.PI * -2 + (searchAngle / 2))
                        + "lol dont care"
                );
                //continue;
            }
            if (localPersonPos.getDistance(new Point2D(0.0, 0.0, LengthUnit.METER), LengthUnit.MILLIMETER) > searchRadius) {
                logger.info("search distance is: " + searchRadius + "mm. person to far away: "
                        + localPersonPos.getDistance(new Point2D(0.0, 0.0, LengthUnit.METER), LengthUnit.MILLIMETER) + " mm.");
                continue;
            }

            logger.info("FOUND PERSON IN SEARCH ANGLE - Person angle" + angle);
            currentPerson.setPosition(globalPersonPos);
            foundPersons.add(currentPerson);
        }

        if (foundPersons.elements.size() > 0) {
            return tokenSuccessPeople;
        }
        return tokenSuccessNoPeople;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (foundPersons.elements.size() > 0) {
                try {
                    personDataListSlot.memorize(foundPersons);
                } catch (CommunicationException ex) {
                    logger.fatal("Unable to write to memory: " + ex.getMessage());
                    return tokenError;
                }
            }
        }
        return curToken;
    }
}
