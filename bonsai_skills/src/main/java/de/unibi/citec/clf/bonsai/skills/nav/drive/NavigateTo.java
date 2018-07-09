package de.unibi.citec.clf.bonsai.skills.nav.drive;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
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
import java.util.Map;

/**
 * Plan and navigate to a navigation goal.
 *
 * Please note that more options, slots, and exit tokens might be available
 * through the selected drive strategy
 * 
 * Currently supported strategies:
 *  NearestToTarget: Try to get as close to the target as possible
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

    private String strategy = "NearestToTarget";

    private ExitToken tokenError;
    private ExitToken tokenSuccess;

    private NavigationActuator navActuator;
    private Sensor<PositionData> robotPositionSensor;
    private MemorySlotReader<NavigationGoalData> navigationGoalDataSlot;

    private DriveStrategy driveStrategy;
    private NavigationGoalData targetGoal;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        strategy = configurator.requestOptionalValue(KEY_STRATEGY, strategy);

        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);
        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        navigationGoalDataSlot = configurator.getReadSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        driveStrategy = DriveStrategyBuilder.createStrategy(strategy, configurator, navActuator, robotPositionSensor);
    }

    @Override
    public boolean init() {
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

        return driveStrategy.init(targetGoal);
    }

    @Override
    public ExitToken execute() {
        if (robotPositionSensor == null) {
            logger.error("execute NavigateTo: Robot position sensor is null");
            return tokenError;
        }
        DriveStrategy.StrategyState state = driveStrategy.execute();
        switch (state) {
            case SUCCESS:
                return tokenSuccess;
            case ERROR:
                return tokenError;
            case NOT_FINISHED:
                return ExitToken.loop(50);
            case PATH_BLOCKED:
                return tokenError;
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
