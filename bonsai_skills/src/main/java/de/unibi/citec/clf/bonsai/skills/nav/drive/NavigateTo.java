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
import de.unibi.citec.clf.bonsai.strategies.drive.DriveStrategy;
import de.unibi.citec.clf.bonsai.util.helper.DriveStrategyBuilder;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import java.io.IOException;

/**
 * Plan and navigate to a navigation goal.
 *
 * Please note that more options, slots, and exit tokens might be available
 * through the selected drive strategy
 *
 * Currently supported strategies: NearestToTarget: Try to get as close to the
 * target as possible
 *
 * <pre>
 *
 * Options:
 *  #_STRATEGY: [String] Optional (default: NearestToTarget)
 *                  -> Strategy used for drive
 *
 * Slots:
 *  NavigationGoalDataSlot: [NavigationGoalData] [Read]
 *      -> Navigation goal to drive to
 *
 * ExitTokens:
 *  success:    Drive finished successfully
 *  error:      Drive failed
 *
 * Sensors:
 *
 *
 * Actuators:
 *  NavigationActuator: [NavigationActuator]
 *      -> Called to execute drive
 *
 * </pre>
 *
 * @author cklarhorst
 * @author jkummert
 */
public class NavigateTo extends AbstractSkill {

    private static final String KEY_STRATEGY = "#_STRATEGY";
    private final static String KEY_TIMEOUT = "#_TIMEOUT";

    private String strategy = "NoStrategy";
    private long timeout = -1L;

    private ExitToken tokenErrorOther;
    private ExitToken tokenSuccess;
    private ExitToken tokenErrorNotMoved;
    private ExitToken tokenErrorTimeout;

    private NavigationActuator navActuator;
    private Sensor<PositionData> robotPositionSensor;
    private MemorySlotReader<NavigationGoalData> navigationGoalDataSlot;

    private DriveStrategy driveStrategy;
    private NavigationGoalData targetGoal;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        strategy = configurator.requestOptionalValue(KEY_STRATEGY, strategy);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        if(timeout > 0) {
            tokenErrorTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"));
        }

        tokenErrorOther = configurator.requestExitToken(ExitStatus.ERROR().ps("other"));
        tokenErrorNotMoved = configurator.requestExitToken(ExitStatus.ERROR().ps("not_moved"));
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);
        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        navigationGoalDataSlot = configurator.getReadSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        driveStrategy = DriveStrategyBuilder.createStrategy(strategy, configurator, navActuator, robotPositionSensor);
    }

    @Override
    public boolean init() {
        
        if (timeout > 0) {
            logger.debug("using nav timeout of " + timeout + " ms");
            timeout += Time.currentTimeMillis();
        }
        
        try {
            targetGoal = navigationGoalDataSlot.recall();

            if (targetGoal == null) {
                logger.error("your navigationGoalDataSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("exception", ex);
            return false;
        }

        boolean res = driveStrategy.init(targetGoal);

        if (!res) {
            logger.fatal("driveStrategy.init returned false, goal was: " + targetGoal);
        }

        return res;
    }

    @Override
    public ExitToken execute() {
        
        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
                logger.info("Navigate to reached timeout");
                return tokenErrorTimeout;
            }
        }
        
        if (robotPositionSensor == null) {
            logger.error("execute NavigateTo: Robot position sensor is null");
            return ExitToken.fatal();
        }
        DriveStrategy.StrategyState state = driveStrategy.execute();
        switch (state) {
            case SUCCESS:
                return tokenSuccess;
            case ERROR:
                return tokenErrorOther;
            case NOT_FINISHED:
                return ExitToken.loop(50);
            case PATH_BLOCKED:
                return tokenErrorOther;
            case NOT_MOVED:
                return tokenErrorNotMoved;
            default:
                logger.fatal("Unimplemented state " + state);
                return ExitToken.fatal();
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        try {
            navActuator.manualStop();
        } catch (IOException ex) {
            logger.fatal("Could not call manual stop", ex);
            return ExitToken.fatal();
        }
        return curToken;
    }

}
