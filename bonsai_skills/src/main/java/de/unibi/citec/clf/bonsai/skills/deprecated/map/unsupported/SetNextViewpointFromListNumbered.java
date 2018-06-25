package de.unibi.citec.clf.bonsai.skills.deprecated.map.unsupported;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.map.ViewpointList;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import java.io.IOException;

/**
 * Inserts next viewpoint from viewpoint list as navigation target. Removes this viewpoint from the viewpoint list, when
 * keep was not set true. Returns SetNextViewpointFromList.success.noFurtherGoal if the list of viewpoints is empty.
 *
 * @author vlosing
 * @author lkettenb
 */
public class SetNextViewpointFromListNumbered extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNofurthergoal;

    /**
     * when keep is set true, no viewpoints are deleted.
     */
    private static final String KEEP = "#_KEEP";

    /**
     * Slots used by this state.
     */
    private MemorySlot<ViewpointList> viewpointListSlot;
    private MemorySlot<NavigationGoalData> navigationGoalDataSlot;
    /**
     * Sensors used by this state.
     */
    private Sensor<PositionData> positionSensor;
    private ViewpointList viewpoints;
    private NavigationGoalData nextGoal = null;
    private PositionData currentPosition;

    private boolean keep = false;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNofurthergoal = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noFurtherGoal"));
        viewpointListSlot = configurator.getSlot("ViewpointListSlot", ViewpointList.class);
        navigationGoalDataSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        // Initialize sensors
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        keep = configurator.requestOptionalBool(KEEP, keep);
    }

    @Override
    public boolean init() {
        try {
            currentPosition = positionSensor.readLast(500);
            viewpoints = viewpointListSlot.recall();

            if (currentPosition == null || viewpoints == null) {
                logger.error("No viewpoints or position data (in 500ms) available.");
                return false;
            }
        } catch (CommunicationException exe) {
            logger.fatal("could not write nextGoal to memory");
        } catch (IOException | InterruptedException e) {
            logger.fatal("Error while trying to read from memory: " + e.getMessage());
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {

        if (viewpoints.isEmpty()) {
            return tokenSuccessNofurthergoal;
        } else {
            Viewpoint vp = viewpoints.get(0);
            nextGoal = new NavigationGoalData(vp);
            if (!keep) {
                viewpoints.remove(vp);
            }
            logger.debug("Next viewpoint: " + vp.getLabel());
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        ExitStatus current = getCurrentStatus();
        try {
            viewpointListSlot.memorize(viewpoints);
        } catch (CommunicationException exe) {
            logger.fatal("could not write into slot");
        }
//        }
        if (nextGoal != null) {
//            try {
//                memoryActuatorNavGoal.replace(nextGoal);
//            } catch (IOException ex) {
            try {
                navigationGoalDataSlot.memorize(nextGoal);
            } catch (CommunicationException exe) {
                logger.fatal("could not write nextGoal to memory");
            }
//            }
        }
        return curToken;
    }
}
