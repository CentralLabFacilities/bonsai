
package de.unibi.citec.clf.bonsai.skills.deprecated.arm;



import de.unibi.citec.clf.bonsai.actuators.deprecated.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.arm.ArmController180;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author nils
 */
public class FilterGrasps extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ArmController180 armController;
    private PicknPlaceActuator poseAct;
    private String filter = "";
    private MemorySlot<String> StringSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        poseAct = configurator.getActuator("PoseActuatorTobi", PicknPlaceActuator.class);
        StringSlot = configurator.getSlot("StringSlot", String.class);
    }

    @Override
    public boolean init() {
        armController = new ArmController180((poseAct));
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            filter = StringSlot.recall();
        } catch (CommunicationException ex) {
            Logger.getLogger(FilterGrasps.class.getName()).log(Level.SEVERE, null, ex);
        }
        if (!"side".equals(filter) && !"top".equals(filter)) {
            filter = "all";
        }
        armController.filterGrasps(filter);
        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
}
