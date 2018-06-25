package de.unibi.citec.clf.bonsai.skills.deprecated.map.unsupported;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.AnnotationHelper;
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
public class SetNextViewpointFromList extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNofurthergoal;

    /**
     * when keep is set true, no viewpoints are deleted.
     */
    private static final String KEEP = "#_KEEP";

    /**
     * The goal that is to be set.
     */
    private NavigationGoalData nextGoal = null;
    /**
     * Slots used by this state.
     */
    private MemorySlot<ViewpointList> viewpointListSlot;
    /**
     * Sensors used by this state.
     */
    private Sensor<PositionData> positionSensor;
    private ViewpointList viewpoints;
    private MemorySlot<NavigationGoalData> memorySlot;
    private PositionData currentPosition;

    private boolean keep = false;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNofurthergoal = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noFurtherGoal"));
        // Initialize sensors
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        // Init slots
        viewpointListSlot = configurator.getSlot("ViewpointListSlot", ViewpointList.class);
        memorySlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        keep = configurator.requestOptionalBool(KEEP, keep);
    }

    @Override
    public boolean init() {
        try {
            viewpoints = (ViewpointList) viewpointListSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not load Viewpoint List");
            return false;
        }

        try {
            currentPosition = positionSensor.readLast(200);

            if (currentPosition == null || viewpoints == null) {
                logger.error("No viewpoints or position data (in 200ms) available.");
                return false;
            }
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
            Viewpoint vp = AnnotationHelper.closestViewpoint(currentPosition, viewpoints);
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
        } catch (CommunicationException ex) {
            logger.error("Could not memorize viewpoints");
            return tokenError;
        }
        if (nextGoal != null) {
            try {
                memorySlot.memorize(nextGoal);
            } catch (CommunicationException exe) {
                logger.fatal("could not write nextGoal to memory");
            }
        }
        return curToken;
    }
}
