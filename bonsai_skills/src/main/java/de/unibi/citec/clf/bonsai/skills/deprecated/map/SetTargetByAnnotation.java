package de.unibi.citec.clf.bonsai.skills.deprecated.map;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.MapReader;
import de.unibi.citec.clf.bonsai.util.helper.AnnotationHelper;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.map.AnnotationList;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import java.util.Map;

/**
 * Use this state to write the {@link PositionData} of an {@link Annotation} its {@link Viewpoint} to memory.
 *
 * <pre>
 * options:
 * (optional) #_ANNOTATION_LABEL -> name of the annotation
 * (optional) #_VIEWPOINT_LABEL -> name of the viewpoint
 *
 * slots:
 *
 * possible return states are:
 *
 * One(or both) of the optional options has to be present.
 * </pre>
 *
 * @author lkettenb, lruegeme
 */
@Deprecated
public class SetTargetByAnnotation extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    //defaults
    private boolean slots = false;

    private static final String KEY_ANNOTATION = "#_ANNOTATION_LABEL";
    private static final String KEY_VIEWPOINT = "#_VIEWPOINT_LABEL";
    private static final String KEY_FROM_SLOT = "#_USE_SLOT";

    private static final String SLOT_ANNOTATIONS = "AnnotationListSlot";
    private static final String SLOT_NAVGOAL = "NavigationGoalDataSlot";
    private static final String SLOT_ANNOTATIONS_LABEL = "AnnotationLabelSlot";
    private static final String SLOT_VIEWPOINT_LABEL = "ViewpointLabelSlot";

    private String annotationLabel = null;
    private String viewpointLabel = null;
    private MemorySlot<AnnotationList> annotationSlot;
    private MemorySlot<NavigationGoalData> navSlot;

    private MemorySlot<String> memorizedAnnotation;
    private MemorySlot<String> memorizedViewpoint;

    private PositionData positionData = null;
    private AnnotationHelper annotationManager;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        navSlot = configurator.getSlot(SLOT_NAVGOAL, NavigationGoalData.class);
        annotationSlot = configurator.getSlot(SLOT_ANNOTATIONS, AnnotationList.class);

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

        if (annotationLabel != null && viewpointLabel != null) {
            Viewpoint vp = annotationManager.getViewpoint(viewpointLabel, annotationLabel);
            if (vp != null) {
                positionData = vp;
                return tokenSuccess;
            }
        } else if (annotationLabel != null) {
            positionData = annotationManager.getAnnotationCentroid(annotationLabel);
            if (positionData != null) {
                return tokenSuccess;
            }
        } else if (viewpointLabel != null) {
            Viewpoint vp = annotationManager.getViewpoint(viewpointLabel);
            if (vp != null) {
                positionData = vp;
                return tokenSuccess;
            }
        }
        logger.error("No position found for Annotation:" + annotationLabel + " and viewpoint: " + viewpointLabel);
        logger.debug("##### ANNOTATE USES xpath=/ #####");
        logger.error("List of Annotations in Memory:");
        for (Annotation a : annotationManager.getAnnotations()) {
            logger.error(" " + a.getLabel());
            for (Viewpoint v : a.getViewpoints()) {
                logger.error("  " + v.getLabel());
            }
        }
        return tokenError;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (getCurrentStatus().isSuccess()) {
            try {
                if (positionData != null) {
                    navSlot.memorize(new NavigationGoalData(positionData));
                } else {
                    return ExitToken.fatal();
                }
            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
