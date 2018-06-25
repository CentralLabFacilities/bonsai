package de.unibi.citec.clf.bonsai.skills.deprecated.arm;


import de.unibi.citec.clf.bonsai.actuators.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.arm.ArmController180;

/**
 * TODO: untobify
 * Arm unblock.
 */
public class UnblockArm extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private ArmController180 armController;
    private PicknPlaceActuator poseAct;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        poseAct = configurator.getActuator("PoseActuatorTobi",
                PicknPlaceActuator.class);
    }

    @Override
    public boolean init() {
        armController = new ArmController180(poseAct);
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            armController.unblock();
        } catch (Exception ex) {
            return ExitToken.fatal();
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
}
