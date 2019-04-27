package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.GazeActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.concurrent.Future;

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
 *  #_MIN_TURNING_ANGLE:        [double]
 *      -> Minimum horizontal angle in rad for the head movements turning.
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

    private String KEY_MAX_ANGLE = "#_MAX_ANGLE";
    private String KEY_MIN_ANGLE = "#_MIN_ANGLE";
    private String KEY_MIN_TURNING_ANGLE = "#_MIN_TURNING_ANGLE";
    private String KEY_TIMEOUT = "#_TIMEOUT";
    private String KEY_UUID = "#_UUID";

    private ExitToken tokenErrorNotFound;
    //set loop time to 14hz
    private ExitToken tokenLoopDiLoop = ExitToken.loop(200);

    private MemorySlotReader<PersonData> targetPersonSlot;

    private GazeActuator gazeActuator;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> positionSensor;

    private List<PersonData> currentPersons;
    private String targetID;
    private PositionData robotPos;
    private double maxAngle = 0.78;
    private double minAngle = -0.78;
    private double minTurningAngle = 0.04;
    //robert sagt 0.0 4 ist besser als 0.08;
    private double lastAngle = 0.0;

    private long timeout;
    private long initialTimeout = 3000;
    private float turnAngleMultiplier = 0.75f;
    private long gazeSpeed = 100; //was 0.125 per default in actuator
    private Future<Void> gazeFuture;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenErrorNotFound = configurator.requestExitToken(ExitStatus.ERROR().ps("notFound"));

        maxAngle = configurator.requestOptionalDouble(KEY_MAX_ANGLE, maxAngle);
        minAngle = configurator.requestOptionalDouble(KEY_MIN_ANGLE, minAngle);
        minTurningAngle = configurator.requestOptionalDouble(KEY_MIN_TURNING_ANGLE, minTurningAngle);
        initialTimeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int)initialTimeout);

        targetPersonSlot = configurator.getReadSlot("TargetPersonSlot", PersonData.class);

        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator.class);

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        targetID = configurator.requestOptionalValue(KEY_UUID, null);
    }

    @Override
    public boolean init() {

        if (targetID == null) {
            try {
                targetID = targetPersonSlot.recall().getUuid();
            } catch (CommunicationException ex) {
                logger.warn("Could not read target id from slot.", ex);
                return false;
            }
        } else {
            logger.info("Using provided UUID: "+targetID);
        }

        if (targetID == null){
            logger.warn("target id was null!");
        }


        if (initialTimeout > 0) {
            logger.debug("using timeout of " + initialTimeout + " ms");
            timeout = initialTimeout + Time.currentTimeMillis();
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (Time.currentTimeMillis() > timeout) {
            logger.info("Search for person reached timeout");
            return tokenErrorNotFound;
        }

        try {
            currentPersons = personSensor.readLast(100);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from person sensor.", ex);
            return ExitToken.fatal();
        }
        
        try {
            robotPos = positionSensor.readLast(-1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from position sensor.", ex);
            return tokenLoopDiLoop;
        }

        if (currentPersons == null) {
            logger.debug("Person list null");
            return tokenLoopDiLoop;
        }

        if (robotPos == null) {
            logger.warn("Got no robot position");
            return tokenLoopDiLoop;
        }

        if (currentPersons.size() == 0) {
            logger.warn("########## Person list size is 0 ############");
        }

        for (int i = 0; i < currentPersons.size(); ++i) {
            if (currentPersons.get(i).getUuid().equals(targetID)) {
                logger.info("person position: " + currentPersons.get(i).getPosition().toString() + "robot position: " + robotPos.toString());
                PositionData posDataLocal = getLocalPosition(currentPersons.get(i).getPosition(), robotPos);

                if (posDataLocal == null) {
                    return tokenLoopDiLoop;
                }

                double horizontal = Math.atan2(posDataLocal.getY(LengthUnit.METER), posDataLocal.getX(LengthUnit.METER));
                float vertical = 0;

                if (horizontal > maxAngle) {
                    horizontal = maxAngle;
                } else if (horizontal < minAngle) {
                    horizontal = minAngle;
                }
                if(Math.abs(horizontal-lastAngle) < minTurningAngle){
                    logger.debug("Person's angle was not big enough to turn!");
                    //gazeActuator.setGazeTargetPitch(vertical);
                    timeout = initialTimeout + Time.currentTimeMillis();

                    return tokenLoopDiLoop;
                }

                int scaling_factor = 10;

                float x_rel = (float)Math.cos(horizontal) * scaling_factor;
                float y_rel = (float)Math.sin(horizontal) * scaling_factor;
                float z_rel = (float)Math.sin(vertical) * scaling_factor;

                Point3D target = new Point3D(x_rel, y_rel, z_rel, LengthUnit.METER, "torso_lift_link");

                logger.info("Looking at point: (x: " + x_rel+ " / y: " +y_rel+ " / z:  "+ z_rel +" / frame: torso_lift_link) with duration: " + gazeSpeed);

                gazeFuture = gazeActuator.lookAt(target, gazeSpeed);

                lastAngle = horizontal;
                timeout = initialTimeout + Time.currentTimeMillis();

                return tokenLoopDiLoop;
            }
        }

        logger.warn("No found person matched the UUID I am looking for");
        return tokenLoopDiLoop;

    }

    private PositionData getLocalPosition(PositionData position, PositionData reference) {
        if(position.getFrameId().equals(PositionData.ReferenceFrame.LOCAL.getFrameName())) {
            return position;
        } else {
            return CoordinateSystemConverter.globalToLocal(position, reference);
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
