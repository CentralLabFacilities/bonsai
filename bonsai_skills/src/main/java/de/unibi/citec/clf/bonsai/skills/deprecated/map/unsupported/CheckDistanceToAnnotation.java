package de.unibi.citec.clf.bonsai.skills.deprecated.map.unsupported;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.AnnotationHelper;
import de.unibi.citec.clf.btl.data.map.AnnotationList;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 * Check if the actual distance to a given annotation is bigger than #_GOAL_DISTANCE [in m].
 *
 * Exists with WithinDistance if its lower and OutOfDistance otherwise Can return with fatal if you configured it wrong
 *
 * Default #_GOAL_DISTANCE is 2 m
 *
 */
public class CheckDistanceToAnnotation extends AbstractSkill {

    private static final String KEY_DISTANCE = "#_GOAL_DISTANCE";
    private static final String KEY_FROM_SLOT = "#_USE_SLOT";
    private static final String KEY_ANNOTATION = "#_ANNOTATION_LABEL";
    private static final String KEY_VIEWPOINT = "#_VIEWPOINT_LABEL";

    private boolean slots = false;

    private static final String SLOT_ANNOTATIONS = "AnnotationListSlot";
    private static final String SLOT_NAVGOAL = "NavigationGoalDataSlot";
    private static final String SLOT_ANNOTATIONS_LABEL = "AnnotationLabelSlot";
    private static final String SLOT_VIEWPOINT_LABEL = "ViewpointLabelSlot";

    private String annotationLabel = null;
    private String viewpointLabel = null;

    private MemorySlot<AnnotationList> annotationSlot;

    private MemorySlot<String> memorizedAnnotation;
    private MemorySlot<String> memorizedViewpoint;

    private PositionData positionData = null;
    private AnnotationHelper annotationManager;

    //defaults
    private double minGoalDistance = 2.0;

    // used tokens
    private ExitToken tokenSuccess;

    private Sensor<PositionData> positionSensor;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        annotationSlot = configurator.getSlot(SLOT_ANNOTATIONS, AnnotationList.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        minGoalDistance = configurator.requestOptionalDouble(KEY_DISTANCE, minGoalDistance);
        annotationLabel = configurator.requestOptionalValue(KEY_ANNOTATION, null);
        viewpointLabel = configurator.requestOptionalValue(KEY_VIEWPOINT, null);
        slots = configurator.requestOptionalBool(KEY_FROM_SLOT, slots);

        if (slots) {
            logger.error("using slots now");
            if (annotationLabel == null) {
                memorizedAnnotation = configurator.getSlot(SLOT_ANNOTATIONS_LABEL, String.class);
            } else {
                String ex = "Datamodel with data items (\"" + KEY_ANNOTATION + "\" is set.";
                logger.info(ex);
            }
            memorizedViewpoint = configurator.getSlot(SLOT_VIEWPOINT_LABEL, String.class);
            return;
        }

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        if (annotationLabel == null && viewpointLabel == null) {
            String ex = "Datamodel with data items (\"" + KEY_ANNOTATION + "\" and/or \"" + KEY_VIEWPOINT + "\") is expected, using slots now";
            logger.error(ex);
            throw new SkillConfigurationException(ex);
        }
    }

    @Override
    public boolean init() {

        if (slots) {
            try {
                if (annotationLabel == null) {
                    annotationLabel = memorizedAnnotation.recall();
                }
                viewpointLabel = memorizedViewpoint.recall();
            } catch (CommunicationException ex) {
                return false;
            }
        }

        annotationManager = new AnnotationHelper(annotationSlot);
        logger.debug("Annotation:" + annotationLabel + " and viewpoint: " + viewpointLabel);

        return true;
    }

    @Override
    public ExitToken execute() {
        /*
        if (annotationLabel != null && viewpointLabel != null) {
            Viewpoint vp = annotationManager.getViewpoint(viewpointLabel, annotationLabel);
            if (vp != null) {
                positionData = vp.getCoordinates();
            }
        } else if (annotationLabel != null) {
            positionData = annotationManager.getAnnotationCentroid(annotationLabel);
        } else if (viewpointLabel != null) {
            Viewpoint vp = annotationManager.getViewpoint(viewpointLabel);
            if (vp != null) {
                positionData = vp.getCoordinates();
            }
        }*/

        if (positionData == null) {
            return ExitToken.fatal();
        }

        PositionData currentRobotPosition;
        try {
            currentRobotPosition = positionSensor.readLast(1000);

        } catch (IOException | InterruptedException ex) {
            logger.fatal(ex);
            return ExitToken.fatal();
        }

        if (currentRobotPosition == null) {
            logger.fatal("PositionSensor timed out");
            return ExitToken.loop(100);
        }

        double distance = currentRobotPosition.getDistance(positionData, LengthUnit.METER);
        logger.debug("Distance to object is " + distance + "m" + "  minDistance:" + minGoalDistance);
        if (distance < minGoalDistance) {
            return tokenSuccess;
        }
        return ExitToken.fatal();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
