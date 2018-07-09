package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.GazeActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Turn head towards a position.
 *
 * <pre>
 *
 * Options:
 *  #_BLOCKING:     [boolean] Optional (default: true)
 *                      -> If true skill ends after gaze was completed
 *  #_VERTICAL:     [String] Optional (Default: 0)
 *                      -> Vertical direction to look to in rad
 *
 *
 * Slots:
 *  PositionDataSlot: [PositionData] [Read]
 *      -> The position to look towards to
 *
 * ExitTokens:
 *  success:    Turned head to position
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Read current robot position to determine relation of robot to position
 *
 * Actuators:
 *  GazeActuator: [GazeActuator]
 *      -> Called to control robot gaze
 *
 * </pre>
 *
 * @author jkummert
 */
public class LookToPosition extends AbstractSkill {

    private static final String KEY_BLOCKING = "#_BLOCKING";
    private static final String KEY_VERTICAL = "#_VERTICAL";

    private boolean blocking = true;
    private double vertical = 0.0;

    private ExitToken tokenSuccess;

    private MemorySlotReader<PositionData> positionSlot;

    private GazeActuator gazeActuator;

    private Sensor<PositionData> positionSensor;

    private PositionData robotPos;
    private PositionData posToLook;

    private Future<Boolean> gazeDone;

    @Override
    public void configure(ISkillConfigurator configurator) {

        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);
        vertical = configurator.requestOptionalDouble(KEY_VERTICAL, vertical);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        positionSlot = configurator.getReadSlot("PositionDataSlot", PositionData.class);

        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {

        try {
            posToLook = positionSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read position data from memory", ex);
            return false;
        }

        try {
            robotPos = positionSensor.readLast(200);
        } catch (IOException | InterruptedException ex) {
            logger.error("Not read from position sensor.", ex);
            return false;
        }

        PositionData posDataLocal = CoordinateSystemConverter.globalToLocal(posToLook, robotPos);

        double horizontal = Math.atan2(posDataLocal.getY(LengthUnit.METER), posDataLocal.getX(LengthUnit.METER));

        gazeDone = gazeActuator.setGazeTargetAsync((float) vertical, (float) horizontal);

        return true;
    }

    @Override
    public ExitToken execute() {
        if (!gazeDone.isDone() && blocking) {
            return ExitToken.loop(50);
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
