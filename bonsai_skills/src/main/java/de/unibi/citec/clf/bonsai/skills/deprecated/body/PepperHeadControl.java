package de.unibi.citec.clf.bonsai.skills.deprecated.body;

import de.unibi.citec.clf.bonsai.actuators.StringActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Control peppers head pose to fit certain tasks.
 *
 * TODO: refactor to poseactuator for pepper. use executeposture instead
 * 
 * @author jkummert
 */
public class PepperHeadControl extends AbstractSkill {

    public enum HeadPose {
        LOOKATPERSON("-10", "lookatperson"),
        DRIVEPOSE("10", "drivepose");

        private final String tilt;
        private final String poseName;

        HeadPose(String tilt, String name) {
            this.poseName = name;
            this.tilt = tilt;
        }

        public String getPoseName() {
            return poseName;
        }

        public String getTilt() {
            return tilt;
        }
    }

    private static final String KEY_POSE = "#_POSE";

    private StringActuator headActuator;
    private HeadPose headPose;

    String poseIn;

    private ExitToken tokenSuccess;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        headActuator = configurator.getActuator("PepperHeadActuator", StringActuator.class);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        poseIn = configurator.requestValue(KEY_POSE);

    }

    @Override
    public boolean init() {

        switch (poseIn) {
            case "lookatperson":
                headPose = HeadPose.LOOKATPERSON;
                break;
            case "drivepose":
                headPose = HeadPose.DRIVEPOSE;
                break;
            default:
                logger.warn("Invalid head pose. Using lookatperson as default");
                headPose = HeadPose.LOOKATPERSON;
                break;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            headActuator.sendString(headPose.getTilt());
        } catch (IOException ex) {
            Logger.getLogger(PepperHeadControl.class.getName()).log(Level.SEVERE, null, ex);
            return ExitToken.fatal();
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
