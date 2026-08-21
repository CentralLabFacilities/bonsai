package de.unibi.citec.clf.bonsai.skills.arm.grasping;

import de.unibi.citec.clf.bonsai.actuators.PlanningSceneActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Clear the planning scene.
 *
 * <pre>
 *
 * Options:
 * #_KEEP_ATTACHED        [boolean] Optional (default: false)
 *      -> Specify whether collision objects attached to the robot
 *         should be kept instead of being deleted.
 *
 * Slots:
 *
 * ExitTokens:
 * success:               Planning scene successfully cleared
 * error:                 Planning scene could not be cleared
 *
 * Sensors:
 *
 * Actuators:
 *  PlanningSceneActuator
 *
 * </pre>
 *
 * @author lruegeme
 */

public class ClearPlanningScene extends AbstractSkill {
    private static final String KEY_KEEP_ATTACHED = "#_KEEP_ATTACHED";

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private PlanningSceneActuator graspAct;

    private Future<Boolean> returnFuture;

    private boolean keepAttached;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        keepAttached = configurator.requestOptionalBool(KEY_KEEP_ATTACHED, false);

        graspAct = configurator.getActuator("PlanningSceneActuator", PlanningSceneActuator.class);
    }

    @Override
    public boolean init() {
        returnFuture = graspAct.clearScene(keepAttached);
        logger.debug("clearing planning scene...");

        return true;
    }

    @Override
    public ExitToken execute() {
        if (!returnFuture.isDone()) {
            return ExitToken.loop();
        }
        try {
            if (returnFuture.get()) {
                return tokenSuccess;
            } else {
                return tokenError;
            }
        } catch (InterruptedException | ExecutionException e) {
            return tokenError;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if(returnFuture != null && !returnFuture.isDone()) {
            returnFuture.cancel(true);
        }
        return curToken;
    }
}
