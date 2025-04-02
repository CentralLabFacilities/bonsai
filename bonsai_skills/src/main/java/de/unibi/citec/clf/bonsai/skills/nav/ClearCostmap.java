package de.unibi.citec.clf.bonsai.skills.nav;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;

/**
 * Clear the entire costmap.
 *
 * <pre>
 *
 * Options:
 *
 * Slots:
 *
 * ExitTokens:
 *  success:    Clear costmap called successfully
 *  error:      Could not clear costmap
 *
 * Sensors:
 *
 *
 * Actuators:
 *  NavigationActuator: [NavigationActuator]
 *      -> Called to clear the costmap
 *
 * </pre>
 *
 * @author jkummert
 */
public class ClearCostmap extends AbstractSkill {

    private ExitToken tokenSuccess;

    private NavigationActuator navActuator;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            navActuator.clearCostmap();
            return tokenSuccess;
        } catch (IOException ex) {
            logger.fatal("Could not communicate with navserver to clear costmap. Error:" + ex.getMessage());
            return ExitToken.fatal();
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
