package de.unibi.citec.clf.bonsai.skills.nav.drive;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.CommandResult;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.navigation.TurnData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Turns the robot to a given navigation goal.
 *
 * <pre>
 *
 * Options:
 *  #_TIMEOUT:      [long] Optional (default: -1)
 *                      -> Skill timeout in ms
 *
 * Slots:
 *  NavigationGoalDataSlot: [NavigationGoalData] [Read]
 *      -> Navigation goal to turn towards to
 *
 * ExitTokens:
 *  success:            Turn successful
 *  success.timeout:    Timeout reached (only used when #_TIMEOUT is set)
 *  error:              Turn failed or cancelled
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Get current robot position
 *
 * Actuators:
 *  NavigationActuator: [NavigationActuator]
 *      -> Called to execute drive
 *
 * </pre>
 *
 * @author lruegeme, jkummert
 */
public class TurnTo extends AbstractSkill {

    private static final String KEY_TIMEOUT = "#_TIMEOUT";

    private long timeout = -1;

    private ExitToken tokenSuccess;
    private ExitToken tokenError;
    private ExitToken tokenSuccessPsTimeout;

    private MemorySlotReader<NavigationGoalData> navigationGoalDataSlot;
    private NavigationActuator navActuator;
    private Sensor<PositionData> robotPositionSensor;

    private Future<CommandResult> navResult;
    private PositionData pos;
    private NavigationGoalData targetGoal;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);
        navigationGoalDataSlot = configurator.getReadSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        if (timeout > 0) {
            tokenSuccessPsTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        }
    }

    @Override
    public boolean init() {
        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + "ms");
            timeout += Time.currentTimeMillis();
        }
        try {
            targetGoal = navigationGoalDataSlot.recall();
            pos = robotPositionSensor.readLast(1000);
        } catch (CommunicationException | IOException | InterruptedException ex) {
            logger.fatal("Could not read navigationgoal slot or from position sensor", ex);
            return false;
        }
        if (targetGoal == null) {
            logger.error("your navigationGoalDataSlot was empty");
            return false;
        } else if (pos == null) {
            logger.error("pos is null");
            return false;
        }
        logger.debug("robot: " + pos.toString());
        logger.debug("goal: " + targetGoal.toString());

        double angle = pos.getRelativeAngle(targetGoal, AngleUnit.RADIAN);
        logger.debug("turning for: " + angle + "rad");
        try {
            navActuator.manualStop();
        } catch (IOException ex) {
            logger.error(ex);
        }
        TurnData turnData = new TurnData(angle, AngleUnit.RADIAN, .6, RotationalSpeedUnit.RADIANS_PER_SEC);
        try {
            navResult = navActuator.moveRelative(null, turnData);
        } catch (IOException e) {
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (navResult == null) {
            logger.fatal("nav actuator returned no future object");
            return tokenError;
        }
        if (!navResult.isDone()) {
            if (timeout < Time.currentTimeMillis()) {
                logger.info("TurnTo timed out");
                try {
                    navActuator.manualStop();
                } catch (IOException ex) {
                    logger.fatal("could not manual Stop", ex);
                }
                return tokenSuccessPsTimeout;
            }
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
                    return tokenError;
                default:
                    logger.error("nav actuator returned " + navResult.get().getResultType()
                            + "," + navResult.get() + "thats currently not really handled");
                    return tokenError;
            }
        } catch (ExecutionException | InterruptedException e) {
            logger.fatal("there was an exception in execute");
            logger.debug("exception occurred", e);
            return ExitToken.fatal();
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
