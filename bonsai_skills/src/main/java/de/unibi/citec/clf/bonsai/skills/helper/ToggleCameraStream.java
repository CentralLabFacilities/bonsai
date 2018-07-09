package de.unibi.citec.clf.bonsai.skills.helper;

import de.unibi.citec.clf.bonsai.actuators.CameraStreamActuator;
import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.grasp.RobotType;

/**
 *
 *
 * @author lruegeme
 *
 */
public class ToggleCameraStream extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private static final String KEY_NAME_STREAM = "#_STREAM_ON";
    private static final String KEY_NAME_TYPE = "#_TYPE";

    private CameraStreamActuator cameraStreamActuator;

    private boolean toggle;
    private String type = "both";

    @Override
    public void configure(ISkillConfigurator configurator) {
        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        cameraStreamActuator = configurator.getActuator("CameraStreamActuator", CameraStreamActuator.class);

        toggle = configurator.requestBool(KEY_NAME_STREAM);
        type = configurator.requestOptionalValue(KEY_NAME_TYPE, type);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        boolean success = false;
        if(type != null){
            switch(type.toLowerCase()){
                case "both":
                    success = cameraStreamActuator.enableColorStream(toggle);
                    if(success) success = cameraStreamActuator.enableDepthStream(toggle);
                    break;
                case "color":
                    success = cameraStreamActuator.enableColorStream(toggle);
                    break;
                case "depth":
                    success = cameraStreamActuator.enableDepthStream(toggle);
                    break;
            }
        }
        if(success) return tokenSuccess;
        return tokenError;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
