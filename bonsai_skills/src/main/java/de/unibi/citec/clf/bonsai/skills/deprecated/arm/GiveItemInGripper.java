package de.unibi.citec.clf.bonsai.skills.deprecated.arm;

import de.unibi.citec.clf.bonsai.actuators.deprecated.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.arm.ArmController180;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.speechrec.Language;

import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Arm Grasps up and waits for item in his gripper.
 *
 * @author dwigand, lruegeme
 *
 */
public class GiveItemInGripper extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private static final String KEY_USE_OSD = "#_USE_GRASP";
    private static final String KEY_ENABLE = "#_ENABLE_SPEECH";

    //defaults
    private boolean slot = false;
    private boolean speak = false;
    private String text = "please hand me the $item";
    private String item = "item";

    private static final int WAIT_FOR_MOVEMENT = 2000;
    private static final double THRESHOLD_GRIPPER_SENSOR = 100;
    private static final long ASK_TIMEOUT = 6000;

    private ArmController180 armController;
    private SpeechActuator speechActuator;
    private PicknPlaceActuator poseAct;

    private boolean gripperOpen;
    private ObjectShapeData object;
    private long timeOut = 0;

    private MemorySlot<ObjectShapeData> objectSlot;
    private MemorySlot<String> patternSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        poseAct = configurator.getActuator("PoseActuatorTobi", PicknPlaceActuator.class);
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);

        slot = configurator.requestOptionalBool(KEY_USE_OSD, slot);
        speak = configurator.requestOptionalBool(KEY_ENABLE, speak);

        objectSlot = configurator.getSlot("GraspObjectSlot", ObjectShapeData.class);
        patternSlot = configurator.getSlot("GraspPatternSlot", String.class);

    }

    @Override
    public boolean init() {
        if (slot) {
            try {
                object = objectSlot.recall();
            } catch (CommunicationException ex) {
                Logger.getLogger(GiveItemInGripper.class.getName()).log(Level.SEVERE, null, ex);
            }
            if (object != null) {
                item = object.getBestLabel();
            }
        } else {
            String pattern = item;
            try {
                pattern = patternSlot.recall();
            } catch (CommunicationException ex) {
                Logger.getLogger(GiveItemInGripper.class.getName()).log(Level.SEVERE, null, ex);
            }
            if (pattern == null) {
                pattern = item;
            }
            String[] i = pattern.split(";");
            if (i.length > 1) {
                item = i[0];
            } else {
                item = "object";
            }

        }
        text = text.replaceAll("$item", item);

        if (speak) {
            say(text);
        }

        armController = new ArmController180(poseAct);
        gripperOpen = false;
        timeOut = Time.currentTimeMillis();
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            if (!gripperOpen) { // Does this only one time for init.
                gripperOpen = true;
                armController.openGripper();
                return ExitToken.loop(WAIT_FOR_MOVEMENT);
            }

            // Checks this, till a object is detected in his gripper.
            double sensorMid = armController.getGipperSensorData().getInfraredMiddle();
            logger.debug("MiddleInfSensor: " + sensorMid);
            if (sensorMid < THRESHOLD_GRIPPER_SENSOR) {
                armController.closeGripperByForce();
                if (armController.isSomethingInGripper()) {
                    //not needed ArmController180.setCarrying(true);
                    return tokenSuccess;
                } else {
                    //not needed ArmController180.setCarrying(false);
                    return tokenError;
                }
            } else {
                // Loops
                if ((Time.currentTimeMillis() - timeOut) > ASK_TIMEOUT) {
                    timeOut = Time.currentTimeMillis();
                    if (speak) {
                        say(text);
                    }
                }
                return ExitToken.loop();
            }
        } catch (IOException ex) {
            return ExitToken.fatal();
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        object = new ObjectShapeData();
        ObjectShapeData.Hypothesis h = new ObjectShapeData.Hypothesis();
        h.setClassLabel(item);
        h.setReliability(1);
        object.addHypothesis(h);
        try {
            objectSlot.memorize(object);
        } catch (Exception ex) {
            logger.fatal(ex);
            //return false;
        }
        return curToken;
    }

    private void say(String txt) {
        try {
            speechActuator.sayAsync(txt, Language.EN);

        } catch (IOException ex) {
            Logger.getLogger(GiveItemInGripper.class.getName()).log(Level.SEVERE, null, ex);
        }
    }
}
