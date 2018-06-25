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
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
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
 * @author jkummert
 */
public class LookToGoal extends AbstractSkill {

    private static final String KEY_BLOCKING = "#_BLOCKING";

    private boolean blocking = true;

    private ExitToken tokenSuccess;

    private MemorySlotReader<NavigationGoalData> navigationMemorySlot;

    private GazeActuator gazeActuator;

    private Sensor<PositionData> positionSensor;

    private PositionData robotPos;
    private NavigationGoalData navGoal;

    private Future<Boolean> gazeDone;

    @Override
    public void configure(ISkillConfigurator configurator) {

        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);

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
        PositionData posData = new PositionData(navGoal.getX(LengthUnit.METER), navGoal.getY(LengthUnit.METER), 0, LengthUnit.METER, AngleUnit.RADIAN);

        PositionData posDataLocal = CoordinateSystemConverter.globalToLocal(posData, robotPos);

        double vertical = Math.atan2(posDataLocal.getY(LengthUnit.METER), posDataLocal.getX(LengthUnit.METER));
        double horizontal = Math.atan2(-0.25, posDataLocal.getX(LengthUnit.METER));

        gazeDone = gazeActuator.setGazeTargetAsync((float) vertical, (float) horizontal);

        return true;
    }

    @Override
    public ExitToken execute() {

        if (!gazeDone.isDone() && blocking) {
            return ExitToken.loop();
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
