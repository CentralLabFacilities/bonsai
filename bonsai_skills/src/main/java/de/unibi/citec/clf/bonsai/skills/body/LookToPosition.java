package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.GazeActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;

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
 * @author dleins
 */

@Deprecated
public class LookToPosition extends AbstractSkill {

    private static final String KEY_DURATION = "#_DURATION";
    private static final String KEY_BLOCKING = "#_BLOCKING";

    private boolean blocking = false;
    private int duration = 2000;

    private ExitToken tokenSuccess;

    private MemorySlotReader<PositionData> positionSlot;

    private GazeActuator gazeActuator;

    private PositionData posToLook;
    private Future<Void> gazeDone;

    @Override
    public void configure(ISkillConfigurator configurator) {

        duration = configurator.requestOptionalInt(KEY_DURATION, duration);
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        positionSlot = configurator.getReadSlot("PositionDataSlot", PositionData.class);

        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator.class);
    }

    @Override
    public boolean init() {

        try {
            posToLook = positionSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read position data from memory", ex);
            return false;
        }

        Point3D pointToLookAt = new Point3D(
                (float)posToLook.getX(LengthUnit.METER),
                (float)posToLook.getY(LengthUnit.METER),
                1.5F
        );

        gazeDone = gazeActuator.lookAt(pointToLookAt, duration);

        return true;
    }

    @Override
    public ExitToken execute() {
        if (blocking && !gazeDone.isDone()) {
            return ExitToken.loop(50);
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
