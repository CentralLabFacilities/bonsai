package de.unibi.citec.clf.bonsai.skills.deprecated.map.unsupported;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.AnnotationHelper;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.map.AnnotationList;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.map.ViewpointList;
import java.util.LinkedList;

/**
 * Use this state to write a {@link List} of {@link Viewpoint}s to memory. The skill will use the viewpoints that match
 * the given prefix together with numbers from 0..N. E.g. a prefix "searchPerson" will find viewpoints called
 * "searchPerson0", "searchPerson1" and so on.
 *
 * Use a {@link Datamodel} containing an item with id "#_VIEWPOINT_PREFIX" to specify the viewpoints to use.
 *
 * @author adreyer
 */
public class MakeListOfAllViewpoints extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccess;

    /**
     * Default ID of the variable that contains the annotation its label.
     */
    private static final String ANNOTATION_PREFIX = "#_ANNOTATION_PREFIX";
    private static final String VIEWPOINT_PREFIX = "#_VIEWPOINT_PREFIX";
    private String viewpointPrefix = "";
    private String annotationPrefix = "";

    /*
     * Sensors used by this state.
     */
    private MemorySlot<AnnotationList> annotationListSlot;
    /*
     * Actuators used by this state.
     */
    private MemorySlot<ViewpointList> viewpointListSlot;
    /**
     * List of viewpoints which is stored in memory
     */
    private ViewpointList viewpointList;

    /**
     * Manager to read latest annotations.
     */
    AnnotationHelper annotationManager;
    AnnotationList annotationList;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        // Initialize actuators
        viewpointListSlot = configurator.getSlot("ViewpointListSlot", ViewpointList.class);
        // Initialize sensors
        annotationListSlot = configurator.getSlot("AnnotationListSlot", AnnotationList.class);

        viewpointPrefix = configurator.requestOptionalValue(VIEWPOINT_PREFIX, viewpointPrefix);
        annotationPrefix = configurator.requestOptionalValue(ANNOTATION_PREFIX, annotationPrefix);

    }

    @Override
    public boolean init() {

        logger.debug("Search viewpoints after annotationPrefix: " + annotationPrefix + " and viewpointPrefix: " + viewpointPrefix);

        try {
            annotationList = annotationListSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read any Annotations");
            return false;
        }
        if (annotationList.isEmpty()) {
            logger.error("AnnotationList is empty");
            return false;
        }

        viewpointList = new ViewpointList();

        return true;
    }

    @Override
    public ExitToken execute() {

        //List<Annotation> annotationList = annotationManager.getAnnotations();
        logger.debug("Number of possible annotations: " + annotationList.size());
        boolean foundOne = false;

        for (Annotation anno : annotationList) {
            // Look for annotation that match the prefix
            if (anno.getLabel().startsWith(annotationPrefix)) {
                // Look for viewpoints that match the prefix
                LinkedList<Viewpoint> viewpointListCurrent = anno.getViewpoints();
                for (Viewpoint vp : viewpointListCurrent) {
                    if (vp.getLabel().startsWith(viewpointPrefix)) {
                        viewpointList.add(vp);
                        foundOne = true;
                    }
                }
            }
        }
        if (!foundOne) {
            logger.error("Could not find any matching viewpoint.");
            return tokenError;
        }
        if (viewpointList.isEmpty()) {
            logger.error("ViewpointList is empty.");
            return tokenError;
        }
        logger.info("All viewpoints in list:");
        viewpointList.forEach((vp) -> {
            logger.info(vp.getLabel());
        });
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (getCurrentStatus().isSuccess()) {
            try {
                viewpointListSlot.memorize(viewpointList);
                return curToken;
            } catch (CommunicationException ex) {
                logger.error("Could not memorize viewpoint List");
                return tokenError;
            }
        }
        return tokenError;
    }
}
