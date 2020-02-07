package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.ObjectHelper;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectData.Hypothesis;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

/**
 * Filters objects for grasping.
 *
 * <pre>
 * run this skill after recognizeObjects to select canditates for grasping.
 * can filter by
 *      - ";" seperated string of labels (e.g "apple;milk")
 *      - closest to objectPosition (#_BY_POSITION)
 *      - additional filtering by plane
 *
 * </pre>
 *
 * @author lruegeme
 */
public class SelectObjectsForGrasping extends AbstractSkill {

    private static final String UNKNOWN_LABEL = "unknown";
    private static final String GRASP_ANYTHING_LABEL = "anything";
    private static final String KEY_DEBUG = "#_LABELS";
    private static final String KEY_MINREL = "#_MIN_REL";
    private static final String KEY_BEST = "#_USE_BEST_LABEL_ONLY";
    private static final String KEY_BY_POSITION = "#_BY_POSITION";
    private static final String KEY_BY_PLANE = "#_BY_PLANE";

    //defaults 
    private boolean bestOnly = true;
    private double minRel = -1.0;
    private String pattern = "";
    private final boolean filterByLabel = true;
    private boolean byPosition = false;
    private boolean byPlane = false;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessLowReliability;
    private ExitToken tokenErrorNotFound;

    private MemorySlot<ObjectShapeList> objectsRecognizedSlot;
    private MemorySlot<ObjectShapeList> targetObjectsSlot;
    private MemorySlot<String> patternSlot = null;

    private ObjectShapeList foundObjects;
    private ObjectShapeList wanted;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorNotFound = configurator.requestExitToken(ExitStatus.ERROR().ps("notFound"));

        objectsRecognizedSlot = configurator.getSlot("ObjectShapeListSlot", ObjectShapeList.class);
        targetObjectsSlot = configurator.getSlot("TargetObjectsSlot", ObjectShapeList.class);

        byPlane = configurator.requestOptionalBool(KEY_BY_PLANE, byPlane);
        byPosition = configurator.requestOptionalBool(KEY_BY_POSITION, byPosition);
        bestOnly = configurator.requestOptionalBool(KEY_BEST, bestOnly);
        minRel = configurator.requestOptionalDouble(KEY_MINREL, minRel);
        pattern = configurator.requestOptionalValue(KEY_DEBUG, pattern);

        if (!bestOnly) {
            tokenSuccessLowReliability = configurator.requestExitToken(ExitStatus.SUCCESS().ps("lowReliability"));
        }

        if (byPosition) {
            throw new SkillConfigurationException("by position unsupported");
            //get slot
            //return;
        }

        if (byPlane) {
            throw new SkillConfigurationException("by plane unsupported");
            //get slot
            //return;
        }

        if (!pattern.isEmpty()) {
            logger.debug("using debug objects instead of slot: " + pattern);
        } else {
            patternSlot = configurator.getSlot("GraspPatternSlot", String.class);
        }

    }

    @Override
    public boolean init() {

        try {
            foundObjects = objectsRecognizedSlot.recall();
            if (filterByLabel && patternSlot != null) {
                pattern = patternSlot.recall();
            }

        } catch (CommunicationException ex) {
            logger.error(ex.getMessage());
            return false;
        }

        if (foundObjects == null) {
            logger.error("no objects recognized before");
            return false;
        }

        wanted = new ObjectShapeList();

        logger.debug("have objects:");
        for (ObjectShapeData o : foundObjects) {
            logger.debug("\t" + o.getId() + " as " + o.getBestLabel() + " at " + o.getCenter());
        }
        logger.debug("select pattern: " + pattern);

        return true;

    }

    @Override
    public ExitToken execute() {

        if (filterByLabel) {
            return filterByLabel();
        }

        return ExitToken.fatal();

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                ObjectHelper.sortByBestRel(wanted);
                logger.info("selected objects:");
                for (ObjectShapeData o : wanted) {
                    logger.debug("\t" + o.getId() + " as " + o.getBestLabel() + " at " + o.getCenter());
                }
                targetObjectsSlot.memorize(wanted);
            } catch (CommunicationException ex) {
                logger.fatal(ex);
                return ExitToken.fatal();
            }
        }
        return curToken;

    }

    private ExitToken filterByLabel() {

        // default: grasp anything. Will be chosen when no other label is given.
        String[] patterns = {GRASP_ANYTHING_LABEL};
        if (pattern != null) {
            patterns = pattern.split(";");
        }

        ObjectShapeList lowRel = new ObjectShapeList();

        boolean calcRel = (minRel == -1.0);

        for (ObjectShapeData obj : foundObjects) {

            if (bestOnly) {
                for (String p : patterns) {
                    if (obj.getBestLabel().equals(p) || p.equals(GRASP_ANYTHING_LABEL)) {
                        Hypothesis h = new Hypothesis();
                        h.setReliability(obj.getBestRel());
                        h.setClassLabel(obj.getBestLabel());
                        obj.clearHypotheses();
                        obj.addHypothesis(h);
                        wanted.add(obj);
                    }
                }
                continue;
            }

            //(!bestOnly {
            if (calcRel) {
                minRel = 1.0 / obj.getHypotheses().size();
            }
            // !best only
            Hypothesis candidate = new Hypothesis();
            candidate.setReliability(0.0);
            candidate.setClassLabel(UNKNOWN_LABEL);
            for (String p : patterns) {
                for (Hypothesis h : obj.getHypotheses()) {
                    if (h.getClassLabel().equals(p) || p.equals(GRASP_ANYTHING_LABEL)) {
                        if (h.getReliability() > candidate.getReliability()) {
                            candidate = h;
                        }
                    }
                }

            }
            if (candidate.getReliability() > 0.0) {
                obj.clearHypotheses();
                obj.addHypothesis(candidate);
                if (candidate.getReliability() >= minRel) {
                    wanted.add(obj);
                } else {
                    lowRel.add(obj);
                }

            }

            // } (!bestOnly)
        }

        if (wanted.isEmpty()) {
            if (lowRel.isEmpty()) {
                return tokenErrorNotFound;
            } else {
                wanted = lowRel;
                return tokenSuccessLowReliability;
            }
        } else {
            return tokenSuccess;
        }

    }
}
