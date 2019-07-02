package de.unibi.citec.clf.bonsai.skills.arm.grasping;

import de.unibi.citec.clf.bonsai.actuators.GraspActuator;
import de.unibi.citec.clf.bonsai.actuators.PlanningSceneActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Gasp an object by id.
 *
 * @author lruegeme
 */
public class ClearPlanningScene extends AbstractSkill {

    // used tokens   
    private ExitToken tokenSuccess;

    private PlanningSceneActuator graspAct;


    private static final LengthUnit mm = LengthUnit.MILLIMETER;

    private Future<Boolean> returnFuture;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        graspAct = configurator.getActuator("PlanningSceneActuator", PlanningSceneActuator.class);


    }

    @Override
    public boolean init() {

        returnFuture = graspAct.clearScene();

        return true;
    }

    @Override
    public ExitToken execute() {

        if (!returnFuture.isDone()) {
            logger.debug("grasping is not done yet");
            return ExitToken.loop();
        }

       return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if(returnFuture != null && !returnFuture.isDone()) {
            returnFuture.cancel(true);
        }
        return curToken;
    }


}
