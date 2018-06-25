package de.unibi.citec.clf.bonsai.skills.arm;

import de.unibi.citec.clf.bonsai.actuators.PostureActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Arm moves to the pose given in the Key #_POSE.
 *
 * grasp_up, fold_up, carry_side, home
 * 
 * @author lruegeme, nrasic, ll
 */
public class PlanToPose extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private PostureActuator poseAct;
    private Future<Boolean> success;
    private String pose;
    private final String pose_KEY = "#_POSE";
    private static final String KEY_CHOOSE_GROUP = "#_CHOOSE_GROUP";
    
    private MemorySlot<String> groupSlot;
    private boolean overrideGroup = false;    
    private String group = "left_arm";

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        poseAct = configurator.getActuator("PostureActuator", PostureActuator.class);

        pose = configurator.requestValue(pose_KEY);
        overrideGroup = configurator.requestOptionalBool(KEY_CHOOSE_GROUP, overrideGroup);

        if (overrideGroup){
            groupSlot = configurator.getSlot("GroupSlot", String.class);
            logger.info("using group slot!");
        }
        
    }

    @Override
    public boolean init() {

        if (overrideGroup) {
            try {
                String gs = groupSlot.recall();

                if (gs.contains("right")) { //dirty
                    group = "right_arm";
                } else {
                    logger.error("Using default planning group");
                    group = "left_arm";
                }
            } catch (CommunicationException ex) {
                Logger.getLogger(PlanToPose.class.getName()).log(Level.SEVERE, null, ex);
            } catch (NullPointerException ex) {
                logger.error("Using default planning group");
                group = "left_arm";
            }
        }
        
        logger.info("Using planning group: " + group);
        success = poseAct.assumePose(pose, group);
        logger.info("planning to: " + pose);
        
        return true;

    }

    @Override
    public ExitToken execute() {
        if (success == null) {
            return ExitToken.fatal();
        } else if (success.isCancelled()) {
            return tokenError;
        } else if (success.isDone()) {
            logger.debug("future is done");
            try {
                if (success.get()) {
                    logger.debug("Arm moved to " + pose + " correctly!!!!");
                    return tokenSuccess;
                } else {
                    logger.error("could not execute the Movement!");
                    return tokenError;
                }
            } catch (InterruptedException | ExecutionException ex) {
                logger.error("Ex caught!");
                return tokenError;
            }
        } else {
            return ExitToken.loop(50);
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
