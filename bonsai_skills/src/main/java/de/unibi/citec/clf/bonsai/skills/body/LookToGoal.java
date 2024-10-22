package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.GazeActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Turn head towards a navigation goal.
 *
 * <pre>
 *
 * Options:
 *  #_BLOCKING:     [boolean] Optional (default: true)
 *                      -> If true skill ends after gaze was completed
 *  #_HEIGHT        [double] Optional (default: 0.0)
 *                      -> The height to look at
 *
 * Slots:
 *  NavigationGoalDataSlot: [NavigationGoalData] [Read]
 *      -> The Navigation Goal to look towards to
 *
 * ExitTokens:
 *  success:    Turned head to goal
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Read current robot position to determine relation of robot to goal
 *
 * Actuators:
 *  GazeActuator: [GazeActuator]
 *      -> Called to control robot gaze
 *
 * </pre>
 *
 * @author dleins
 */
public class LookToGoal extends AbstractSkill {

    private static final String KEY_BLOCKING = "#_BLOCKING";
    private static final String KEY_Z = "#_HEIGHT";

    private boolean blocking = true;
    private double z = 0.0;

    private ExitToken tokenSuccess;

    private MemorySlotReader<NavigationGoalData> navigationMemorySlot;

    private GazeActuator gazeActuator;

    private Sensor<PositionData> positionSensor;

    private PositionData robotPos;
    private NavigationGoalData navGoal;

    private Future<Void> gazeDone;

    @Override
    public void configure(ISkillConfigurator configurator) {

        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);
        z = configurator.requestOptionalDouble(KEY_Z, z);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        navigationMemorySlot = configurator.getReadSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {

        try {
            navGoal = navigationMemorySlot.recall();
        } catch (CommunicationException ex) {
            logger.error("nav goal empty");
            return false;
        }

        try {
            robotPos = positionSensor.readLast(200);
        } catch (IOException | InterruptedException ex) {
            logger.error("Not read from position sensor.", ex);
            return false;
        }

        Point3D targetPoint = new Point3D(navGoal.getX(LengthUnit.METER), navGoal.getY(LengthUnit.METER), z, LengthUnit.METER, navGoal.getFrameId());

        gazeDone = gazeActuator.lookAt(targetPoint,1.0,250);

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
