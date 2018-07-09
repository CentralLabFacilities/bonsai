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
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalDataList;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutionException;

/**
 * Look for all persons matching the given description and save them in a list. The local positions of the persons are
 * converted into global positions, to make them usable in case the robot changes its position.
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
 *  #_EXCLUDE_UUIDS:    [boolean] Optional (default: false)
 *                          -> Whether to check if a found person is in the given UUID blacklist
 *  #_USE_SLOTS:        [boolean] Optional (default: false)
 *                          -> Whether to use slots instead of datamodel parameters
 *
 * Slots:
 *  PersonDataListSlot:             [PersonDataList] [Read]
 *      -> Found persons matching all descriptions
 *  ExcludedUUIDListSlot:           [String] [Write]
 *      -> List of blacklisted UUIDs separated by a ";"
 *
 * ExitTokens:
 *  success.found:          Person matching all descriptions was found. Person and navigation goal saved to memory
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
 * @author dleins
 */
@Deprecated
public class SearchForMultiplePersons extends AbstractSkill {

    private final static String KEY_DISTANCE = "#_MAX_DIST";
    private final static String KEY_ANGLE = "#_MAX_ANGLE";
    private final static String KEY_TIMEOUT = "#_TIMEOUT";
    private final static String KEY_GESTURE = "#_GESTURE";
    private final static String KEY_POSTURE = "#_POSTURE";
    private final static String KEY_EXCLUDE_UUIDS = "#_EXCLUDE_UUIDS";
    private final static String KEY_USE_SLOTS = "#_USE_SLOTS";

    private double searchRadius = Double.MAX_VALUE;
    private double searchAngle = Double.MAX_VALUE;
    private long timeout = -1l;
    private String[] gestureString;
    private String[] postureString;
    private String[] uuidBlacklist;

    private boolean excludeUUIDS = false;
    private boolean useSlots = false;

    private ExitToken tokenSuccessNoperson;
    private ExitToken tokenSuccessFound;

    private GetPersonAttributesActuator attributeActuator;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> positionSensor;

    private MemorySlotWriter<PersonDataList> personDataListSlot;
    private MemorySlotReader<String> excludedUUIDListSlot;
    private MemorySlotReader<String> gestureSlot;
    private MemorySlotReader<String> postureSlot;
    private MemorySlotReader<String> genderSlot;
    private MemorySlotReader<String> shirtcolorSlot;
    private MemorySlotReader<String> ageSlot;

    PersonDataList foundPersons = new PersonDataList();

    private List<PersonAttribute.Gesture> gesture = new ArrayList<>();
    private List<PersonAttribute.Posture> posture = new ArrayList<>();
    private List<PersonAttribute.Gender> gender = new ArrayList<>();
    private List<PersonAttribute.Shirtcolor> shirtcolor = new ArrayList<>();

    private int ageFrom = Integer.MIN_VALUE;
    private int ageTo = Integer.MAX_VALUE;

    public void configure(ISkillConfigurator configurator) {

        useSlots = configurator.requestOptionalBool(KEY_USE_SLOTS, useSlots);
        excludeUUIDS = configurator.requestOptionalBool(KEY_EXCLUDE_UUIDS, excludeUUIDS);
        searchRadius = configurator.requestOptionalDouble(KEY_DISTANCE, searchRadius);
        searchAngle = configurator.requestOptionalDouble(KEY_ANGLE, searchAngle);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);

        gestureString = configurator.requestOptionalValue(KEY_GESTURE, "0").split(";");
        postureString = configurator.requestOptionalValue(KEY_POSTURE, "0").split(";");

        if (timeout > 0) {
            tokenSuccessNoperson = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("noPerson"));
        }
        tokenSuccessFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("found"));

        excludedUUIDListSlot = configurator.getReadSlot("ExcludedUUIDListSlot", String.class);

        gestureSlot = configurator.getReadSlot("GestureSlot", String.class);
        postureSlot = configurator.getReadSlot("PostureSlot", String.class);
        genderSlot = configurator.getReadSlot("GenderSlot", String.class);
        shirtcolorSlot = configurator.getReadSlot("ShirtcolorSlot", String.class);
        ageSlot = configurator.getReadSlot("AgeSlot", String.class);


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

        attributeActuator = configurator.getActuator("GetPersonAttributesActuator", GetPersonAttributesActuator.class);
        personDataListSlot = configurator.getWriteSlot("PersonDataListSlot", PersonDataList.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
    }

    @Override
    public boolean init() {

        if (excludeUUIDS) {
            logger.debug("Excluding UUIDs");
            try {
                String tmpString = excludedUUIDListSlot.recall();
                if (tmpString != null) {
                    uuidBlacklist = tmpString.split(";");
                }
            } catch (CommunicationException e) {
                logger.error("Error while reading exluded UUIDs from slot");
                return false;
            }
        }

        if (useSlots) {
            logger.debug("Using slots");
            try {
                String tmpString = gestureSlot.recall();

                if (tmpString != null) {
                    gestureString = tmpString.split(";");
                    tmpString = null;
                    logger.debug("Gesture slot was not null. Filtering by gestures from slot");
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
                }

                tmpString = postureSlot.recall();

                if (tmpString != null) {
                    logger.debug("Posture slot was not null. Filtering by postures from slot");
                    postureString = tmpString.split(";");
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
                }

                tmpString = genderSlot.recall();
                if (tmpString != null && !tmpString.isEmpty()) {
                    for (String gnd : tmpString.split(";")) {
                        gender.add(PersonAttribute.Gender.fromString(gnd));
                    }
                    logger.info("will filter by genders: " + tmpString);
                }

                tmpString = ageSlot.recall();
                logger.debug("age slot recall: "+tmpString);

                if (tmpString == null || tmpString.isEmpty()) {
                    logger.info("your AgeSlot was empty, will not filter by age");
                    ageFrom = Integer.MIN_VALUE;
                    ageTo = Integer.MAX_VALUE;
                } else if (tmpString.contains("-")) {
                    logger.debug("age is in from-to format");
                    ageFrom = Integer.parseInt(tmpString.split("-")[0]);
                    ageTo = Integer.parseInt(tmpString.split("-")[1]);
                } else {
                    logger.debug("age is in single int format");
                    ageFrom = ageTo = Integer.parseInt(tmpString);
                }
                logger.info("will filter by age: " + ageFrom + "-" + ageTo);
                tmpString = null;

                tmpString = shirtcolorSlot.recall();

                if (tmpString == null || tmpString.isEmpty()) {
                    logger.info("your ShirtcolorSlot was empty, will not filter by shircolor");
                } else {
                    for (String shirtc : tmpString.split(";")) {
                        if (PersonAttribute.Shirtcolor.fromString(shirtc) == null) {
                            logger.warn("Shirt color " + shirtc + " not defined.");
                            continue;
                        }
                        logger.info("Searching for shirt color: "+PersonAttribute.Shirtcolor.fromString(shirtc));
                        shirtcolor.add(PersonAttribute.Shirtcolor.fromString(shirtc));
                    }
                }

            } catch (CommunicationException e) {
                logger.error("Could not read form filter slots");
                return false;
            }
        }

        logger.debug("Scanning for persons ... searchDist:" + searchRadius + " searchAngle:" + searchAngle);
        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + " ms");
            timeout += System.currentTimeMillis();
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

        for (PersonData currentPerson : possiblePersons) {

            logger.debug("processing person UUID: "+currentPerson.getUuid());
            double angle = robotPosition.getRelativeAngle(currentPerson.getPosition(), AngleUnit.RADIAN);

            logger.debug("Checking angle...");
            if (!(angle < searchAngle / 2 && angle > searchAngle / -2)) {
                logger.debug("Person with angle" + angle + " out of search angle");
                continue;
            }
            logger.debug("Angle check passed");

            if (excludeUUIDS) {
                logger.debug("Checking uuid blacklist");
                if (uuidBlacklist != null && Arrays.asList(uuidBlacklist).contains(currentPerson.getUuid())) {
                    logger.debug("Ignoring person in uuid blacklist");
                    continue;
                }
                logger.debug("UUID check passed");
            }

            PersonAttribute attribute;
            try {
                logger.debug("Checking attributes");
                attribute = attributeActuator.getPersonAttributes(currentPerson.getUuid());
                currentPerson.setPersonAttribute(attribute);
            } catch (InterruptedException | ExecutionException ex) {
                logger.warn("could not get person attribute: " + ex);
                continue;
            }
            logger.debug("Checking gender; Got: "+attribute.getGender());
            if (!gender.isEmpty() && attribute.getGender() != null && !gender.contains(attribute.getGender())) {
                continue;
            }
            logger.debug("Gender check passed");
            logger.debug("Checking shirt color; got: "+attribute.getShirtcolor());
            if (!shirtcolor.isEmpty() && (attribute.getShirtcolor() == null || !shirtcolor.contains(attribute.getShirtcolor()))) {
                logger.debug("ignoring person with wrong shirt color");
                continue;
            }
            logger.debug("Shirt color check passed");

            try {
                logger.debug("Checking age; Got: "+attribute.getAge());
                if (attribute.getAgeFrom() > ageTo || attribute.getAgeTo() < ageFrom) {
                    continue;
                }
                logger.debug("Age check passed");
            } catch (NumberFormatException ex) {
                logger.error("Got an NumberFormatException: " + ex.getMessage());
            }

            logger.debug("Checking gestures; Got: "+attribute.getGestures());
            if (!gesture.isEmpty() && !Collections.disjoint(gesture, attribute.getGestures())) {
                logger.debug("Person with wrong gestures " + attribute.getGestures() + " ignored");
                continue;
            }
            logger.debug("Gesture check passed");
            logger.debug("Checking posture; Got: "+attribute.getPosture());
            if (!posture.isEmpty() && !posture.contains(attribute.getPosture())) {
                logger.debug("Person with wrong posture " + attribute.getPosture() + " ignored");
                continue;
            }
            logger.debug("Posture check passed");

            foundPersons.add(currentPerson);
            logger.info("found person: " + currentPerson.getUuid());

        }

        if (foundPersons.elements.size() > 0) {
            return tokenSuccessFound;
        }

        logger.debug("No persons left in list. Looping");

        return ExitToken.loop(50);
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (foundPersons.elements.size() > 0) {
                try {
                    personDataListSlot.memorize(foundPersons);
                } catch (CommunicationException ex) {
                    logger.fatal("Unable to write to memory: " + ex.getMessage());
                    return ExitToken.fatal();
                }
            }
        }
        return curToken;
    }
}
