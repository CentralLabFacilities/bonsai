package de.unibi.citec.clf.bonsai.skills;



import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;


/**
 * Use this class to stop the robot immediately.
 * 
 * @author prenner
 */
public class ManualStop extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    /*
     * Actuator used by this state.
     */
    private NavigationActuator navActuator;

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        logger.warn("Stopping robot.");
        try {
            navActuator.manualStop();
        } catch (IOException ex) {
            logger.error(ex.getMessage());
            return ExitToken.fatal();
        }
        return tokenSuccess;
        
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        navActuator = configurator.getActuator(
                "NavigationActuator", 
                NavigationActuator.class);
    }
    
}
