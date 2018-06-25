package de.unibi.citec.clf.bonsai.skills.nav.goal;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
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

/**
 * Set polar coordinates relative to the robot as navigation goal.
 *
 * <pre>
 *
 * Options:
 *  #_DIST:             [double] Required
 *                          -> Distance to drive in m
 *  #_ANGLE:            [double] Required
 *                          -> Angle to turn in rad
 *  #_CONVERT_GLOBAL:   [boolean] Optional (default: false)
 *                          -> Whether to convert goal to the global frame
 *
 * Slots:
 *  NavigationGoalDataSlot: [NavigationGoalData] [Write]
 *      -> Navigation goal result
 *
 * ExitTokens:
 *  success:    Navigation goal computed and saved successfully
 *  error:      Navigation goal could not by saved
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Get the current robot position
 *
 *
 * Actuators:
 *
 * </pre>
 *
 * @author cklarhorst, jkummert
 */
public class SetLocalPolarTarget extends AbstractSkill {

    private static final String DISTANCE_KEY = "#_DIST";
    private static final String ANGLE_KEY = "#_ANGLE";
    private static final String CONVERT_TO_GLOBAL_KEY = "#_CONVERT_GLOBAL";

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotWriter<NavigationGoalData> navigationGoalDataSlot;

    private NavigationGoalData target;
    private double distance;
    private double angle;
    private boolean convertToGlobal = false;
    PositionData robotPos;

    private Sensor<PositionData> robotPositionSensor;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        navigationGoalDataSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        distance = configurator.requestDouble(DISTANCE_KEY);
        angle = configurator.requestDouble(ANGLE_KEY);
        convertToGlobal = configurator.requestOptionalBool(CONVERT_TO_GLOBAL_KEY, convertToGlobal);
    }

    @Override
    public boolean init() {
        try {
            robotPos = robotPositionSensor.readLast(1000);
        } catch (IOException | InterruptedException ex) {
            logger.fatal("Could not read from position sensor", ex);
            return false;
        }
        if (robotPos == null) {
            logger.error("robotPos is null");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        target = CoordinateSystemConverter.polar2NavigationGoalData(robotPos, angle, distance, AngleUnit.RADIAN, LengthUnit.METER);
        if (convertToGlobal) {
            logger.debug("target is: " + target);
            PositionData pos = CoordinateSystemConverter.localToGlobal(target, robotPos);
            target.setX(pos.getX(LengthUnit.METER), LengthUnit.METER);
            target.setY(pos.getY(LengthUnit.METER), LengthUnit.METER);
            target.setYaw(pos.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
            logger.debug("Convert to global: " + target);
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                navigationGoalDataSlot.memorize(target);
            } catch (CommunicationException ex) {
                logger.error("Could not save navigation goal", ex);
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
