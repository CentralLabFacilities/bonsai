package de.unibi.citec.clf.bonsai.skills.arm;


import de.unibi.citec.clf.bonsai.actuators.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Checks if the Arm is in home position or is somewhere else. Goes into an
 * error if we have inconsistens in assumedPose
 *
 * RETURNS:
 *
 * SUCESS.HOME SUCESS.GRASPUP SUCESS.CARRY ERROR FATAL
 *
 * TODO: untobify
 * 
 * @author nrasic
 */
public class AssumedArmPose extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccessFold_up;
    private ExitToken tokenErrorTimeout;
    private ExitToken tokenSuccessCarry_side;
    private ExitToken tokenSuccessGrasp_up;
    private ExitToken tokenSuccessHome;
    private ExitToken tokenSuccessOther;

    private PicknPlaceActuator poseAct;

    private Future<String> assumedF;

    /*
     * Default timeout if ros_manipulation is not started.
     */
    final long DEFAULT_TIMEOUT = 5000;

    /*
     * Starttime for timout.
     */
    long startTime = -1;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccessHome = configurator.requestExitToken(ExitStatus.SUCCESS()
                .ps("home"));
        tokenSuccessFold_up = configurator.requestExitToken(ExitStatus
                .SUCCESS().ps("fold_up"));
        tokenErrorTimeout = configurator.requestExitToken(ExitStatus.ERROR()
                .ps("timeout"));
        tokenSuccessCarry_side = configurator.requestExitToken(ExitStatus
                .SUCCESS().ps("carry_side"));
        tokenSuccessGrasp_up = configurator.requestExitToken(ExitStatus
                .SUCCESS().ps("grasp_up"));
        tokenSuccessOther = configurator.requestExitToken(ExitStatus.SUCCESS()
                .ps("other"));
        poseAct = configurator.getActuator("PoseActuatorTobi",
                PicknPlaceActuator.class);
    }

    @Override
    public boolean init() {

        startTime = System.currentTimeMillis();

        try {
            assumedF = poseAct.findNearestPose();
        } catch (IOException e) {
            logger.error(e.getMessage());
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        try {
            if (assumedF == null) {
                logger.error("future object is null");
                return ExitToken.fatal();
            }

            if (System.currentTimeMillis() - startTime >= DEFAULT_TIMEOUT) {
                logger.info("Default timeout was set to 5 seconds. Send timeout. Armpose-controller did not respond. Check if Ros manipulation runs.");
                return tokenErrorTimeout;
            }

            if (!assumedF.isDone()) {
                return ExitToken.loop(100);
            }
            String assumed = assumedF.get(100, TimeUnit.MILLISECONDS);

            logger.debug("assumed position: " + assumed);
            switch (assumed) {
                case "home":
                    return tokenSuccessHome;
                case "fold_up":
                    return tokenSuccessFold_up;
                case "carry_side":
                    return tokenSuccessCarry_side;
                case "grasp_up":
                    return tokenSuccessGrasp_up;
                default:
                    return tokenSuccessOther;
            }
        } catch (TimeoutException | InterruptedException | ExecutionException e) {
            logger.error("Timeout while getting assumed armpose");
            return ExitToken.fatal();
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
