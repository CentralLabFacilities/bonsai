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
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;

/**
 * Continually turn head towards a persons head.
 *
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  TargetPersonSlot:   [PersonData] [Read]
 *      -> Read in person to look towards
 *  #_MAX_ANGLE:        [double]
 *      -> Maximum horizontal angle in rad for the head movement.
 *  #_MIN_ANGLE:        [double]
 *      -> Minimum horizontal angle in rad for the head movement.
 *  #_TIMEOUT           [long] Optional (default: 3000)
 *      -> Amount of time robot searches for a person before notFound is sent in ms
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
 * @author dleins
 */
public class LookToPersonHead extends AbstractSkill {

    private ExitToken tokenErrorNotFound;

    private MemorySlotReader<PersonData> targetPersonSlot;

    private GazeActuator gazeActuator;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> positionSensor;

    private List<PersonData> currentPersons;
    private String targetID;
    private PositionData robotPos;

    private String KEY_MAX_ANGLE = "#_MAX_ANGLE";
    private String KEY_MIN_ANGLE = "#_MIN_ANGLE";
    private String KEY_TIMEOUT = "#_TIMEOUT";
    private double maxAngle = 0.78;
    private double minAngle = -0.78;
    private long timeout;
    private long initialTimeout = 3000;
    private double lastVertical;
    private double verticalDamping = 0.1;

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
            logger.debug("using timeout of " + initialTimeout + " ms");
            timeout = initialTimeout + System.currentTimeMillis();
        }

        lastVertical = 0.0;

        return true;
    }

    @Override
    public ExitToken execute() {

        if (System.currentTimeMillis() > timeout) {
            logger.info("Search for person reached timeout");
            return tokenErrorNotFound;
        }

        try {
            currentPersons = personSensor.readLast(-1);
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

        for (int i = 0; i < currentPersons.size(); ++i) {
            if (currentPersons.get(i).getUuid().equals(targetID)) {
                PositionData posData = currentPersons.get(i).getPosition();

                PositionData posDataLocal = CoordinateSystemConverter.globalToLocal(posData, robotPos);

                double horizontal = Math.atan2(posDataLocal.getY(LengthUnit.METER), posDataLocal.getX(LengthUnit.METER));
                
                // Temp. hardcoded vertical angle, to be done after magdeburg
                //  double vertical = -0.17;
                //  if (-1 < currentPersons.get(i).getHeadPosition().getZ(LengthUnit.METER) && currentPersons.get(i).getHeadPosition().getZ(LengthUnit.METER) < 2) {
                //     //logger.debug("Head height: " + -currentPersons.get(i).getHeadPosition().getZ(LengthUnit.METER));
                //     //logger.debug("Head distance: " + posDataLocal.getX(LengthUnit.METER));
                //     vertical = Math.atan2(-currentPersons.get(i).getHeadPosition().getZ(LengthUnit.METER), posDataLocal.getX(LengthUnit.METER)) * 2/5;
                //  }
    
                
                double vertical;
                double distance = robotPos.getDistance(posData, LengthUnit.METER);
                double head_height = currentPersons.get(i).getHeadPosition().getZ(LengthUnit.METER);
                
                // If the person is close and not sitting
                if (distance <= 0.70 && head_height > 1.4) {
                    vertical = Math.toRadians(-25.0);
                // If the person is further away and not sitting
                } else if (distance >= 1.20 && head_height > 1.4) { 
                    vertical = Math.toRadians(-10.0);
                // if every other case set head to 0.0
                } else {
                    vertical = Math.toRadians(0.0);
                }
                
                //Effort to damp headmovement
                // vertical = lastVertical + (vertical - lastVertical) * verticalDamping;

                lastVertical = vertical;

                /*logger.debug("condition met? "+currentPersons.get(i).getHeadPosition().getZ(LengthUnit.METER));
                if (-1 < currentPersons.get(i).getHeadPosition().getZ(LengthUnit.METER) && currentPersons.get(i).getHeadPosition().getZ(LengthUnit.METER) < 1) {

                    //1.18 Meter is ca. the eye height of the pepper
                    double height = 1.18 - currentPersons.get(i).getHeadPosition().getZ(LengthUnit.METER);
                    logger.debug("Head height: " + height);
                    logger.debug("Head distance: " + posDataLocal.getX(LengthUnit.METER));
                    vertical = Math.atan2(height, posDataLocal.getX(LengthUnit.METER));
                }*/

                gazeActuator.setGazeTarget((float) vertical, (float) horizontal);
                timeout = initialTimeout + System.currentTimeMillis();
                //logger.debug("horizontal: "+horizontal+"; vertical: "+vertical);

                //gazeActuator.lookAt(new Pose3D(currentPersons.get(i).getHeadPosition(), new Rotation3D(0,0,0,0, AngleUnit.RADIAN)));
                return ExitToken.loop(50);
            }
        }

        return ExitToken.loop(50);

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
