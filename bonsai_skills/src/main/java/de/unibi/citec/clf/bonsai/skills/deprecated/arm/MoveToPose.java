package de.unibi.citec.clf.bonsai.skills.deprecated.arm;

import de.unibi.citec.clf.bonsai.actuators.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.arm.ArmController180;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Arm moves to the pose given in the Key #_POSE.
 *
 * grasp_up, fold_up, carry_side, home
 *
 * @author lruegeme, nrasic
 */
public class MoveToPose extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private ArmController180 armController;
    private PicknPlaceActuator poseAct;
    private Future<Boolean> success;
    private String pose;
    private final String pose_KEY = "#_POSE";

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        poseAct = configurator.getActuator("PoseActuatorTobi", PicknPlaceActuator.class);

        pose = configurator.requestValue(pose_KEY);

    }

    @Override
    public boolean init() {
        if (pose.isEmpty()) {
            return false;
        }
        armController = new ArmController180((poseAct));
        try {
            logger.info("moving to: " + pose);
            success = armController.directMovement(pose);
        } catch (IOException ex) {
            try {
                logger.error("IOError in ArmController" + ex.getMessage());
                String e = "";
                for (String s : armController.getPoseList()) {
                    e += " ," + s;
                }
                logger.error("possible poses:" + e);
                return false;
            } catch (IOException | InterruptedException | ExecutionException ex1) {
                logger.error("possible poses: grasp_up, fold_up, carry_side, home");
            }
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (success == null) {
            return ExitToken.fatal();
        }
        if (success.isDone()) {
            logger.debug("future is done");
            try {
                if (success.get()) {
                    logger.debug("Arm moved to " + pose + " correctly!!!!");
                    return tokenSuccess;
                } else {
                    logger.error("could not execute the Movement!");
                    return tokenError;
                }
            } catch (InterruptedException ex) {
                logger.error("InterruptEx caught!");
            } catch (ExecutionException ex) {
                logger.error("ExecutionEx caught!");
            }
        } else {
            return ExitToken.loop(50);
        }
        return tokenError;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
