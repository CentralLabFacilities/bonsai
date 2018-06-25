package de.unibi.citec.clf.bonsai.skills.deprecated.arm;


import de.unibi.citec.clf.bonsai.actuators.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.arm.ArmController180;

/**
 * Checks if we have an item in the gripper.
 *
 * @author nrasic
 *
 */
public class HasItemInGripper extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccessHasitem;
    private ExitToken tokenSuccessHasnoitem;

    private ArmController180 armController;
    private PicknPlaceActuator poseAct;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccessHasitem = configurator.requestExitToken(ExitStatus.SUCCESS().ps("hasItem"));
        tokenSuccessHasnoitem = configurator.requestExitToken(ExitStatus.SUCCESS().ps("hasNoItem"));
        poseAct = configurator.getActuator("PoseActuatorTobi", PicknPlaceActuator.class);
    }

    @Override
    public boolean init() {
        armController = new ArmController180((poseAct));
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            //prints alls gripper sensor data into the logger 
            armController.logDebugOutSensor();
            if (armController.isSomethingInGripper()) {
                return tokenSuccessHasitem;
            } else {
                return tokenSuccessHasnoitem;
            }
        } catch (Exception ex) {
            return ExitToken.fatal();
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
