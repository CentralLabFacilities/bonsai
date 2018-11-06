package de.unibi.citec.clf.bonsai.skills.nav.drive;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.navigation.CommandResult;
import de.unibi.citec.clf.btl.data.navigation.DriveData;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.TurnData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import de.unibi.citec.clf.btl.units.SpeedUnit;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Turn and drive without planning.
 *
 * <pre>
 *
 * Options:
 *  #_DIST:         [double] Optional (default: NaN)
 *                      -> Distance to drive in m
 *  #_MOVE_SPEED:   [double] Optional (default: 0.5)
 *                      -> Move speed in m/s
 *  #_ROT_SPEED:    [double] Optional (default: 0.5)
 *                      -> Turn speed in rad/s
 *  #_ANGLE:        [double] Optional (default: NaN)
 *                      -> Angle to turn in rad
 *  #_TIMEOUT:      [long] Optional (default: -1)
 *                      -> Skill timeout in ms
 *  #_DIR_X:        [double] Optional (default: 1.0)
 *                      -> X component of drive direction
 *  #_DIR_Y:        [double] Optional (default: 0.0)
 *                      -> Y component of drive direction
 *
 * Slots:
 *  NavigationGoalDataSlot: [NavigationGoalData] [Read]
 *      -> If neither #_DIST nor #_TURN is set use this slot to drive to
 *
 * ExitTokens:
 *  success:            Drive successful
 *  success.timeout:    Timeout reached (only used when #_TIMEOUT is set)
 *  error.cancelled:    Drive was cancelled by NavigationActuator
 *  error.unknownResult: Drive was failed with unknown result
 *
 * Sensors:
 *
 * Actuators:
 *  NavigationActuator: [NavigationActuator]
 *      -> Called to execute drive
 *
 * </pre>
 *
 * @author prenner, cklarhorst, jkummert
 *
 */
public class DriveDirect extends AbstractSkill {

    private ExitToken tokenSuccessPsTimeout;
    private ExitToken tokenSuccess;
    private ExitToken tokenErrorResultErrorUnhandled;
    private ExitToken tokenErrorCancelled;

    private static final String KEY_DIST = "#_DIST";
    private static final String KEY_MOVE_SPEED = "#_MOVE_SPEED";
    private static final String KEY_ROTATION_SPEED = "#_ROT_SPEED";
    private static final String KEY_ANGLE = "#_ANGLE";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_DIR_X = "#_DIR_X";
    private static final String KEY_DIR_Y = "#_DIR_Y";

    private static final String RESULT_ERROR_UNHANDLED = "unknownResult";

    private long timeout = -1;
    private double dist = Double.NaN;
    private double moveSpeed = 0.5;
    private double angle = Double.NaN;
    private double rotationSpeed = 0.5;
    private double dir_x = 1.0;
    private double dir_y = 0.0;

    private Future<CommandResult> navResult;
    private NavigationActuator navActuator;
    private MemorySlotReader<NavigationGoalData> navigationGoalDataSlot = null;

    private DriveData driveData = null;
    private TurnData turnData = null;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorResultErrorUnhandled = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus(RESULT_ERROR_UNHANDLED));
        tokenErrorCancelled = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("cancelled"));

        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        dist = configurator.requestOptionalDouble(KEY_DIST, dist);
        moveSpeed = configurator.requestOptionalDouble(KEY_MOVE_SPEED, moveSpeed);
        angle = configurator.requestOptionalDouble(KEY_ANGLE, angle);
        rotationSpeed = configurator.requestOptionalDouble(KEY_ROTATION_SPEED, rotationSpeed);
        dir_x = configurator.requestOptionalDouble(KEY_DIR_X, dir_x);
        dir_y = configurator.requestOptionalDouble(KEY_DIR_Y, dir_y);

        if (Double.isNaN(dist) && Double.isNaN(angle)) {
            logger.debug("dist and angle missing, using slot");
            navigationGoalDataSlot = configurator.getReadSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        }

        if (timeout > 0) {
            tokenSuccessPsTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        }
    }

    @Override
    public boolean init() {
        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + "ms");
            timeout += System.currentTimeMillis();
        }

        if (navigationGoalDataSlot != null) {
            try {
                NavigationGoalData targetGoal = navigationGoalDataSlot.recall();
                angle = targetGoal.getYaw(AngleUnit.RADIAN);
                dist = targetGoal.getX(LengthUnit.METER);
            } catch (CommunicationException ex) {
                logger.error("getting navGoal from slot failed");
                return false;
            }
        }

        if (!Double.isNaN(dist) && dist != 0) {
            Point2D direction = new Point2D(dir_x, dir_y, LengthUnit.METER);
            driveData = new DriveData(dist, LengthUnit.METER, moveSpeed, SpeedUnit.METER_PER_SEC, direction);
        }
        if (!Double.isNaN(angle) && angle != 0) {
            turnData = new TurnData(angle, AngleUnit.RADIAN, rotationSpeed, RotationalSpeedUnit.RADIANS_PER_SEC);
        }
        logger.info("Driving " + dist + "m," + angle + "rad," + driveData + "," + turnData);
        try {
            navResult = navActuator.moveRelative(driveData, turnData);
        } catch (IOException e) {
            return false;
        }
        logger.debug("called navactuator.");

        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeout > 0) {
            if (System.currentTimeMillis() > timeout) {
                logger.info("DriveDirect timed out");
                try {
                    navActuator.manualStop();
                } catch (IOException e) {
                    logger.fatal("could not manual Stop", e);
                }
                return tokenSuccessPsTimeout;
            }
        }

        if (navResult == null) {
            logger.fatal("nav actuator returned no future object");
            return ExitToken.fatal();
        }
        if (!navResult.isDone()) {
            return ExitToken.loop(50);
        }
        logger.debug("Driving done!");
        try {
            switch (navResult.get().getResultType()) {
                case SUCCESS:
                    return tokenSuccess;
                case CANCELLED:
                case SUPERSEDED:
                case EMERGENCY_STOPPED:
                case TIMEOUT:
                    return tokenErrorCancelled;
                default:
                    logger.error("nav actuator returned " + navResult.get().getResultType()
                            + "," + navResult.get() + "thats currently not really handled");
                    return tokenErrorResultErrorUnhandled;
            }
        } catch (ExecutionException | InterruptedException e) {
            logger.fatal("there was an exception in execute", e);
            return ExitToken.fatal();
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
