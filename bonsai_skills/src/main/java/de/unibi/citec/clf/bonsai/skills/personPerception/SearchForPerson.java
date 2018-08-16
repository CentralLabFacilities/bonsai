package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.GetPersonAttributesActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutionException;

/**
 * Look for a person and save a navigation goal to drive to them. A description
 * for the person can be given
 *
 * Give gestures and postures as string of integers separated by ";"
 * 
 * <pre>
 *
 * Options:
 *  #_MAX_DIST:         [double] Optional (default: Double.MAX_VALUE)
 *                          -> How far the person can be away from the robot in mm
 *  #_MAX_ANGLE:        [double] Optional (default: Double.MAX_VALUE)
 *                          -> Person must be inside this angle cone in front of the robot in rad
 *  #_TIMEOUT           [long] Optional (default: -1)
 *                          -> Amount of time robot searches for a person in ms
 *  #_GESTURE:          [String[]] Optional (default: "0")
 *                          -> Person has to make one of these gestures. 0 means gesture irrelevant
 *                         POINTING_LEFT = 1, POINTING_RIGHT = 2, RAISING_LEFT_ARM = 3,
 *                         RAISING_RIGHT_ARM = 4, WAVING = 5, NEUTRAL = 6
 *  #_POSTURE:          [String[]] Optional (default: "0")
 *                          -> Person has to have one of these postures. 0 means posture irrelevant
 *                           SITTING = 1, STANDING = 2, LYING = 3
 *  #_GENDER:           [String] Optional (default: "none")
 *                          -> Person has to be the given gender. none means gender irrelevant
 *                          accepted values = male, female
 *                           SITTING = 1, STANDING = 2, LYING = 3
 *  #_AGE_FROM:         [int] Optional (default: Integer.MIN_VALUE)
 *                          -> Persons age intervall has to include an age which is bigger than this parameter, default value means that this condition will always be true
 *  #_AGE_TO:           [int] Optional (default: Integer.MAX_VALUE)
 *                          -> Persons age intervall has to include an age which is smaller than this parameter, default value means that this condition will always be true
 *  #_STOP_DISTANCE:    [double] Optional (default: 800)
 *                          -> How far in front of the person the navigation goal is set in mm
 *  #_EXCLUDE_UUIDS:    [boolean] Optional (default: false)
 *                          -> Whether to check if a found person is in the given UUID blacklist
 *
 * Slots:
 *  NavigationGoalDataSlot:     [NavigationGoalData]
 *      -> Navigation goal in front of the found person
 *  PersonDataSlot:             [PersonData]
 *      -> Found person matching all descriptions
 *
 * ExitTokens:
 *  success.personFound:    Person matching all descriptions was found. Person and navigation goal saved to memory
 *  success.noPerson:       No person matching descriptions found in #_TIMEOUT ms. Only if #_TIMEOUT is greater than 0
 *
 * Sensors:
 *  PositionSensor:     [PositionData]
 *      -> Read in current robot position
 *  PersonSensor:       [PersonDataList]
 *      -> Read in currently seen persons
 *
 * Actuators:
 *  GetPersonAttributesActuator:    [GetPersonAttributesActuator]
 *      -> Recognize gestures und postures people are making to match given descriptions
 *
 * </pre>
 *
 * @author cwitte
 * @author jkummert
 */
@Deprecated
public class SearchForPerson extends AbstractSkill {

    private final static String KEY_DISTANCE = "#_MAX_DIST";
    private final static String KEY_ANGLE = "#_MAX_ANGLE";
    private final static String KEY_TIMEOUT = "#_TIMEOUT";
    private final static String KEY_GESTURE = "#_GESTURE";
    private final static String KEY_POSTURE = "#_POSTURE";
    private final static String KEY_GENDER = "#_GENDER";
    private final static String KEY_AGE_FROM = "#_AGE_FROM";
    private final static String KEY_AGE_TO = "#_AGE_TO";
    private final static String KEY_STOP_DISTANCE = "#_STOP_DISTANCE";
    private final static String KEY_EXCLUDE_UUIDS = "#_EXCLUDE_UUIDS";

    private double searchRadius = Double.MAX_VALUE;
    private double searchAngle = Double.MAX_VALUE;
    private long timeout = -1l;
    private String[] gestureString;
    private String[] postureString;
    private String[] uuidBlacklist;
    private String genderString = "none";
    private int ageFrom = Integer.MIN_VALUE;
    private int ageTo = Integer.MAX_VALUE;
    private double stopDistance = 800;

    private boolean excludeUUIDS = false;

    private ExitToken tokenSuccessNoperson;
    private ExitToken tokenSuccessPersonfound;

    private GetPersonAttributesActuator attributeActuator;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> positionSensor;

    private MemorySlotWriter<NavigationGoalData> navigationGoalSlot;
    private MemorySlotWriter<PersonData> personDataSlot;
    private MemorySlotReader<String> excludedUUIDListSlot;

    NavigationGoalData globalGoal;
    PersonData foundPerson;

    private List<PersonAttribute.Gesture> gesture = new ArrayList<>();
    private List<PersonAttribute.Posture> posture = new ArrayList<>();

    @Override
    public void configure(ISkillConfigurator configurator) {

        excludeUUIDS = configurator.requestOptionalBool(KEY_EXCLUDE_UUIDS, excludeUUIDS);
        searchRadius = configurator.requestOptionalDouble(KEY_DISTANCE, searchRadius);
        searchAngle = configurator.requestOptionalDouble(KEY_ANGLE, searchAngle);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        gestureString = configurator.requestOptionalValue(KEY_GESTURE, "0").split(";");
        for (String ges : gestureString) {

            if (ges.length() == 1 && Character.isDigit(ges.charAt(0))) {
                if (PersonAttribute.Gesture.fromInteger(Integer.parseInt(ges)) == null) {
                    logger.warn("Gesture " + ges + " not defined.");
                    continue;
                }
                logger.info("Searching for gesture: "+PersonAttribute.Gesture.fromInteger(Integer.parseInt(ges)));
                gesture.add(PersonAttribute.Gesture.fromInteger(Integer.parseInt(ges)));
            } else {
                if (PersonAttribute.Gesture.fromString(ges) == null) {
                    logger.warn("Gesture " + ges + " not defined.");
                    continue;
                }
                logger.info("Searching for gesture: "+PersonAttribute.Gesture.fromString(ges));
                gesture.add(PersonAttribute.Gesture.fromString(ges));
            }

        }
        postureString = configurator.requestOptionalValue(KEY_POSTURE, "0").split(";");
        for (String pos : postureString) {

            if (pos.length() == 1 && Character.isDigit(pos.charAt(0))) {
                if (PersonAttribute.Posture.fromInteger(Integer.parseInt(pos)) == null) {
                    logger.warn("Posture " + pos + " not defined.");
                    continue;
                }
                logger.info("Searching for posture: "+PersonAttribute.Posture.fromInteger(Integer.parseInt(pos)));
                posture.add(PersonAttribute.Posture.fromInteger(Integer.parseInt(pos)));
            } else {
                if (PersonAttribute.Posture.fromString(pos) == null) {
                    logger.warn("Posture " + pos + " not defined.");
                    continue;
                }
                logger.info("Searching for posture: "+PersonAttribute.Posture.fromString(pos));
                posture.add(PersonAttribute.Posture.fromString(pos));
            }
        }
        genderString = configurator.requestOptionalValue(KEY_GENDER, genderString);
        ageFrom = configurator.requestOptionalInt(KEY_AGE_FROM, ageFrom);
        ageTo = configurator.requestOptionalInt(KEY_AGE_TO, ageTo);
        stopDistance = configurator.requestOptionalDouble(KEY_STOP_DISTANCE, stopDistance);

        if (timeout > 0) {
            tokenSuccessNoperson = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noPerson"));
        }
        tokenSuccessPersonfound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("personFound"));

        if (!gesture.isEmpty() || !posture.isEmpty() || !genderString.equals("none") || ageFrom!=Integer.MIN_VALUE || ageTo!=Integer.MAX_VALUE) {
            attributeActuator = configurator.getActuator("GetPersonAttributesActuator", GetPersonAttributesActuator.class);
        }

        if (excludeUUIDS) {
            excludedUUIDListSlot = configurator.getReadSlot("ExcludedUUIDListSlot", String.class);
        }

        navigationGoalSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        personDataSlot = configurator.getWriteSlot("PersonDataSlot", PersonData.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
    }

    @Override
    public boolean init() {
        logger.debug("Scanning for persons ... searchDist:" + searchRadius + " searchAngle:" + searchAngle);
        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + " ms");
            timeout += System.currentTimeMillis();
        }

        if (excludeUUIDS) {
            try {
                uuidBlacklist = excludedUUIDListSlot.recall().split(";");
            } catch (CommunicationException e) {
                logger.error("Error while reading exluded UUIDs from slot");
                return false;
            }
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (timeout > 0) {
            if (System.currentTimeMillis() > timeout) {
                logger.info("Search for person reached timeout");
                return tokenSuccessNoperson;
            }
        }

        List<PersonData> possiblePersons = null;
        PositionData robotPosition = null;
        double bestDist = searchRadius;

        try {
            possiblePersons = personSensor.readLast(-1);
            robotPosition = positionSensor.readLast(1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from person or position sensor.");
        }

        if (robotPosition == null) {
            logger.warn("Robot position is null");
            return ExitToken.fatal();
        }
        if (possiblePersons == null) {
            logger.warn("Seen persons is null");
            return ExitToken.loop(100);
        }

        if (possiblePersons.isEmpty()) {
            return ExitToken.loop(100);
        }

        logger.debug("number of detected persons " + possiblePersons.size());


        for (PersonData currentPerson : possiblePersons) {

            double distance = robotPosition.getDistance(currentPerson.getPosition(), LengthUnit.MILLIMETER);
            double angle = robotPosition.getRelativeAngle(currentPerson.getPosition(), AngleUnit.RADIAN);

            if (!(angle < searchAngle / 2 && angle > searchAngle / -2)) {
                logger.debug("Person with angle" + angle + " out of search angle");
                continue;
            }

            if (excludeUUIDS) {
                if (Arrays.asList(uuidBlacklist).contains(currentPerson.getUuid())) {
                    logger.debug("Ignoring person in uuid blacklist");
                    continue;
                }
            }

            if (distance > bestDist) {
                logger.debug("Person out of search radius or already found closer person");
                continue;
            }

            if (!gesture.isEmpty() || !posture.isEmpty() || !genderString.equals("none") || ageFrom!=Integer.MIN_VALUE || ageTo!=Integer.MAX_VALUE) {
                PersonAttribute attribute;
                try {
                    attribute = attributeActuator.getPersonAttributes(currentPerson.getUuid());
                    currentPerson.setPersonAttribute(attribute);
                    logger.debug("got person attributes");
                    if (!gesture.isEmpty() && Collections.disjoint(gesture, attribute.getGestures())) {
                        logger.debug("Person with wrong gestures " + attribute.getGestures() + " ignored");
                        continue;
                    }
                    if (!posture.isEmpty() && !posture.contains(attribute.getPosture())) {
                        logger.debug("Person with wrong posture " + attribute.getPosture() + " ignored");
                        continue;
                    }
                    if (!genderString.equals("none") && !genderString.equals(attribute.getGender().getGenderName())) {
                        logger.debug("Person with wrong gender " + attribute.getGender() + " ignored");
                        continue;
                    }
                    if (ageFrom!=Integer.MIN_VALUE && ageFrom > attribute.getAgeTo()) {
                        logger.debug("Person with wrong age " + attribute.getAgeTo() + " ignored - too young to be in specified range");
                        continue;
                    }
                    if (ageTo!=Integer.MAX_VALUE && ageTo < attribute.getAgeFrom()) {
                        logger.debug("Person with wrong age " + attribute.getAgeFrom() + " ignored - too old to be in specified range");
                        continue;
                    }
                } catch (InterruptedException | ExecutionException ex) {
                    logger.warn("could not get person attribute: " + ex);
                    continue;
                }
            }

            bestDist = distance;
            distance -= stopDistance;

            if (distance < 0) {
                distance = 0;
            }

            globalGoal = CoordinateSystemConverter
                    .polar2NavigationGoalData(
                            robotPosition,
                            angle,
                            distance,
                            AngleUnit.RADIAN, LengthUnit.METER);
            double yaw = robotPosition.getYaw(AngleUnit.RADIAN) + angle;
            globalGoal.setYaw(yaw, AngleUnit.RADIAN);
            globalGoal.setFrameId(currentPerson.getPosition().getFrameId());
            //TODO: use currentPerson.getPosition instead of converting to and from relative
            foundPerson = currentPerson;

            logger.info("found person: " + currentPerson.getUuid());
        }

        if (globalGoal != null && foundPerson != null) {
            return tokenSuccessPersonfound;
        }
        return ExitToken.loop(100);
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (globalGoal != null && foundPerson != null) {
                try {
                    navigationGoalSlot.memorize(globalGoal);
                    personDataSlot.memorize(foundPerson);
                } catch (CommunicationException ex) {
                    logger.fatal("Unable to write to memory: " + ex.getMessage());
                    return ExitToken.fatal();
                }
            }
        }
        return curToken;
    }
}
