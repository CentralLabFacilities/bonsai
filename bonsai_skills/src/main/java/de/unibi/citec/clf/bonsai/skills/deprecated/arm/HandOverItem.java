package de.unibi.citec.clf.bonsai.skills.deprecated.arm;


import de.unibi.citec.clf.bonsai.actuators.deprecated.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.arm.ArmController180;
import de.unibi.citec.clf.btl.data.grasp.KatanaGripperData;
import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Arm releases item, when it's touched on his gripper.
 * 
 * Created by Dennis Leroy Wigand.
 * 
 * 
 */
public class HandOverItem extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private ArmController180 armController;
    private PicknPlaceActuator poseAct;
    private static final int WAIT_THEN_GO_HOME = 4000;
    private static final int THRESHOLD_GRIPPER_SENSOR = 30;
    private long timeOut = 0;
    private final long askTimeout = 6000;
    private SpeechActuator speechActuator;
    private Future<Boolean> isHandOverDone;
    
    Future<Boolean> success;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        poseAct = configurator.getActuator("PoseActuatorTobi",
                PicknPlaceActuator.class);
        speechActuator = configurator.getActuator(
                "SpeechActuator", SpeechActuator.class);
    }

    @Override
    public boolean init() {
        armController = new ArmController180(poseAct);
        try {
            success = poseAct.planMovement("grasp_up");
        } catch (IOException ex) {
            logger.error("IOError in ArmController" + ex.getMessage());
            return false;
        }
        timeOut = Time.currentTimeMillis();
        return true;
    }

    @Override
    public ExitToken execute() {
        try {

            if (!success.isDone()) {
                return ExitToken.loop(100);
            }

            KatanaGripperData gripperData = armController.getGipperSensorData();
            //armController.logDebugOutSensor();
            // Checks this, till a object is detected in his gripper.
            if ((gripperData.getInfraredLeftOutside() < THRESHOLD_GRIPPER_SENSOR)
                    && (gripperData.getInfraredRightOutside() < THRESHOLD_GRIPPER_SENSOR)) {
                armController.openGripper();
                Thread.sleep(WAIT_THEN_GO_HOME);
            } else {
                // Loops
                if ((Time.currentTimeMillis() - timeOut) > askTimeout) {
                    timeOut = Time.currentTimeMillis();
                    speechActuator.say("Please touch my gripper on both sides");
                }
                return ExitToken.loop();
            }

        } catch (IOException | InterruptedException ex) {
            logger.fatal(ex);
            return ExitToken.fatal();
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }

}
