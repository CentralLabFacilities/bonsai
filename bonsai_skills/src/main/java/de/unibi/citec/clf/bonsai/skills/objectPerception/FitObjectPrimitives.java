
package de.unibi.citec.clf.bonsai.skills.objectPerception;


import de.unibi.citec.clf.bonsai.actuators.PlanningSceneActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 *
 * @author llach
 */
public class FitObjectPrimitives extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    Future<Boolean> res;

    private PlanningSceneActuator planningSceneManager;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        planningSceneManager = configurator.getActuator("PlanningSceneManager", PlanningSceneActuator.class);

    }

    @Override
    public boolean init() {
        res = planningSceneManager.manage();
        return true;
    }

    @Override
    public ExitToken execute() {
        while (!res.isDone()) {
            return ExitToken.loop(50);
        }
        try {
            if (res.get().booleanValue()) {
                return tokenSuccess;
            }
        } catch (InterruptedException | ExecutionException ex) {
            logger.error("Could not access return type of planning scene manager");
        }
        return tokenError;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
