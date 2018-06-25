package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.GazeActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 * Continually turn head towards a person.
 *
 * <pre>
 *
 * Options:
 *  #_MAX_ANGLE:        [double]
 *      -> Maximum horizontal angle in rad for the head movement.
 *  #_MIN_ANGLE:        [double]
 *      -> Minimum horizontal angle in rad for the head movement.
 *  #_TIMEOUT           [long] Optional (default: 7000)
 *      -> Amount of time robot searches for a person before notFound is sent in ms
 *
 * Slots:
 *  TargetPersonSlot:   [PersonData] [Read]
 *      -> Read in person to look towards
 *
 * ExitTokens:
 *  error.notFound:      person to follow was lost
 *
 * Sensors:
 *  PersonSensor:       [PersonDataList]
 *      -> Read in currently seen persons
 *  PositionSensor:     [PositionData]
 *      -> Read current robot position
 *
 * Actuators:
 *  GazeActuator: [GazeActuator]
 *      -> Called to execute head movements
 *
 * </pre>
 *
 *
 * @author jkummert
 */
public class LookToPerson extends AbstractSkill {

    private ExitToken tokenErrorNotFound;

    private MemorySlotReader<PersonData> targetPersonSlot;

    private GazeActuator gazeActuator;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> positionSensor;

    private String KEY_MAX_ANGLE = "#_MAX_ANGLE";
    private String KEY_MIN_ANGLE = "#_MIN_ANGLE";
    private String KEY_TIMEOUT = "#_TIMEOUT";

    private List<PersonData> currentPersons;
    private String targetID;
    private PositionData robotPos;
    private double maxAngle = 0.78;
    private double minAngle = -0.78;
    private long timeout;
    private long initialTimeout = 3000;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenErrorNotFound = configurator.requestExitToken(ExitStatus.ERROR().ps("notFound"));

        maxAngle = configurator.requestOptionalDouble(KEY_MAX_ANGLE, maxAngle);
        minAngle = configurator.requestOptionalDouble(KEY_MIN_ANGLE, minAngle);
        initialTimeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int)initialTimeout);

        targetPersonSlot = configurator.getReadSlot("TargetPersonSlot", PersonData.class);

        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator.class);

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {

        try {
            targetID = targetPersonSlot.recall().getUuid();
        } catch (CommunicationException ex) {
            logger.warn("Could not read target id from slot.", ex);
            return false;
        }

        if (initialTimeout > 0) {
            logger.debug("using timeout of " + timeout + " ms");
            timeout = initialTimeout + System.currentTimeMillis();
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (System.currentTimeMillis() > timeout) {
            logger.info("Search for person reached timeout");
            return tokenErrorNotFound;
        }

        try {
            currentPersons = personSensor.readLast(1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from person sensor.", ex);
            return ExitToken.fatal();
        }
        
        try {
            robotPos = positionSensor.readLast(1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from position sensor.", ex);
            return ExitToken.loop(50);
        }

        if (currentPersons == null) {
            logger.debug("Person list null");
            return ExitToken.loop(50);
        }

        if (currentPersons.size() == 0) {
            logger.warn("########## Person list size is 0 ############");
        }

        for (int i = 0; i < currentPersons.size(); ++i) {
            if (currentPersons.get(i).getUuid().equals(targetID)) {
                PositionData posData = currentPersons.get(i).getPosition();

                PositionData posDataLocal = CoordinateSystemConverter.globalToLocal(posData, robotPos);

                double horizontal = Math.atan2(posDataLocal.getY(LengthUnit.METER), posDataLocal.getX(LengthUnit.METER));
                double vertical = 0.174533;

                if (horizontal > maxAngle) {
                    horizontal = maxAngle;
                } else if (horizontal < minAngle) {
                    horizontal = minAngle;
                }

                gazeActuator.setGazeTarget((float) vertical, (float) horizontal);
                timeout = initialTimeout + System.currentTimeMillis();
                return ExitToken.loop(50);
            }
        }

        logger.warn("No found person matched the UUID I am looking for");
        return ExitToken.loop(50);

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}