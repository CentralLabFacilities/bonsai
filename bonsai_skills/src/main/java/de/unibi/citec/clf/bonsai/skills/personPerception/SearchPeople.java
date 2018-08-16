package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.List;

/**
 * Look for all visible persons and save them to a personDataSlot.
 * If the are no current visible persons the skill will loop until time out has been reached.
 * Search can be narrowed down by specifying max angle and distance to the person.
 * The yaw of the person position is adjusted to face to the person. for that the robot position has to be written in the correct slot before.
 *
 *
 * <pre>
 *
 * Options:
 *  #_MAX_DIST:         [double] Optional (default: Double.MAX_VALUE)
 *                          -> How far the person can be away from the robot in mm
 *  #_MAX_ANGLE:        [double] Optional (default: Double.MAX_VALUE)
 *                          -> Person must be inside this angle cone in front of the robot in rad
 *                          will not be taken into account at the moment!
 *  #_TIMEOUT           [long] Optional (default: -1)
 *                          -> Amount of time robot searches for a person in ms
 *
 * Slots:
 *  PersonDataListSlot:             [PersonDataList] [Write]
 *      -> All found persons in a list
 *  PositionDataSlot:             [PositionData] [Read]
 *      -> the robot position to calculate relative angle, and setting the modified yaw in positional part of personData.
 *
 * ExitTokens:
 *  success.people:         There has been at least one person perceived in the given timeout interval satisfying the optional given angle and distance parameters.
 *  success.noPeople:       There has been no person perceived in the given timeout interval satisfying the optional given angle and distance parameters..
 *                           Only if #_TIMEOUT is greater than 0
 *  error:                  There has been an exception while writing to slot.
 *
 * Sensors:
 *  PersonSensor:       [PersonDataList]
 *      -> Read in currently seen persons
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class SearchPeople extends AbstractSkill {

    private final static String KEY_DISTANCE = "#_MAX_DIST";
    private final static String KEY_ANGLE = "#_MAX_ANGLE";
    private final static String KEY_TIMEOUT = "#_TIMEOUT";

    private double searchRadius = Double.MAX_VALUE;
    private double searchAngle = Double.MAX_VALUE;
    private long timeout = -1l;

    private ExitToken tokenSuccessNoPeople;
    private ExitToken tokenSuccessPeople;
    private ExitToken tokenError;

    private Sensor<PersonDataList> personSensor;

    private MemorySlotWriter<PersonDataList> personDataListSlot;
    private MemorySlotReader<PositionData> positionSlot;

    private PersonDataList foundPersons = new PersonDataList();
    private PositionData robotPosition;

    @Override
    public void configure(ISkillConfigurator configurator) {

        searchRadius = configurator.requestOptionalDouble(KEY_DISTANCE, searchRadius);
        searchAngle = configurator.requestOptionalDouble(KEY_ANGLE, searchAngle);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);

        if (timeout > 0) {
            tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noPeople"));
        }
        tokenSuccessPeople = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("people"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personDataListSlot = configurator.getWriteSlot("PersonDataListSlot", PersonDataList.class);
        positionSlot = configurator.getReadSlot("PositionDataSlot", PositionData.class);

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
    }

    @Override
    public boolean init() {
        logger.debug("Scanning for persons ... searchDist:" + searchRadius + " searchAngle:" + searchAngle);
        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + " ms");
            timeout += System.currentTimeMillis();
        }
        try {
            robotPosition = positionSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Unable to read from memory: " + ex.getMessage());
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (timeout > 0) {
            if (System.currentTimeMillis() > timeout) {
                logger.info("Search for person reached timeout");
                return tokenError;
            }
        }

        List<PersonData> possiblePersons = null;

        try {
            possiblePersons = personSensor.readLast(-1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from person sensor.");
        }

        if (possiblePersons == null) {
            logger.warn("Seen persons is null");
            return ExitToken.loop(50);
        }

        if (possiblePersons.isEmpty()) {
            return ExitToken.loop(50);
        }

        for (PersonData currentPerson : possiblePersons) {
            logger.debug("possible person: " + currentPerson.getUuid());
            double angle = robotPosition.getRelativeAngle(currentPerson.getPosition(), AngleUnit.RADIAN);
            double distance = robotPosition.getDistance(currentPerson.getPosition(), LengthUnit.MILLIMETER);

            if (!(angle < searchAngle / 2 && angle > searchAngle / -2)) {
                logger.debug("Person with angle" + angle + " out of search angle. " + "lol dont care");
                //continue;
            }
            if(distance > searchRadius){
                logger.debug("Person with distance " + distance + " is out of search distance");
                continue;
            }

            currentPerson.getPosition().setYaw(robotPosition.getYaw(AngleUnit.RADIAN) + angle,AngleUnit.RADIAN);
            foundPersons.add(currentPerson);
            logger.info("found person: " + currentPerson.getUuid());
        }

        if (foundPersons.elements.size() > 0) {
            return tokenSuccessPeople;
        }
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
                    return tokenError;
                }
            }
        }
        return curToken;
    }
}
