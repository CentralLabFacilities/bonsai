package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectData.Hypothesis;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * Filters objects for grasping.
 *
 * <pre>
 * run this skill after recognizeObjects to select canditates for stacking.
 * can filter by
 *      - ";" seperated string of labels (e.g "apple;milk")
 *      - same label as GraspObjectSlot
 *
 * </pre>
 *
 * @author lruegeme
 */
public class SelectObjectForStacking extends AbstractSkill {

    private static final String KEY_DEBUG = "#_LABELS";

    //defaults 
    private String pattern = "cube";

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlot<ObjectShapeList> objectsRecognizedSlot;
    private MemorySlot<BoundingBox3D> targetObjectSlot;

    private ObjectShapeList foundObjects;
    private BoundingBox3D wanted;

    private CoordinateTransformer coordinateTransformer;

    private double distance = Double.MAX_VALUE;
    Point3D center = new Point3D(0, 0, 0.84, LengthUnit.METER);

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        objectsRecognizedSlot = configurator.getSlot("ObjectShapeListSlot", ObjectShapeList.class);
        targetObjectSlot = configurator.getSlot("TargetBoxSlot", BoundingBox3D.class);
        coordinateTransformer = (CoordinateTransformer) configurator.getTransform();
       
        pattern = configurator.requestOptionalValue(KEY_DEBUG, pattern);
        
    }

    @Override
    public boolean init() {

        try {
            foundObjects = objectsRecognizedSlot.recall();
        } catch (CommunicationException ex) {
            logger.error(ex.getMessage());
            return false;
        }

        if (foundObjects == null) {
            logger.error("no objects recognized before");
            return false;
        }

        return true;

    }

    @Override
    public ExitToken execute() {

        return filterByLabel();

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                targetObjectSlot.memorize(wanted);
            } catch (CommunicationException ex) {
                logger.fatal(ex);
                return ExitToken.fatal();
            }
        }
        return curToken;

    }

    private ExitToken filterByLabel() {

        String[] patterns = pattern.split(";");
        double curRel = 0.0;
        BoundingBox3D candidate = null;

        for (ObjectShapeData obj : foundObjects) {

            for (String p : patterns) {
                if (p.equals("anything")) {
                    double dist = obj.getCenter().distance(center);
                    logger.debug("all distance: " + dist);

                    if (dist < distance) {
                        curRel = 0.1;
                        candidate = obj.getBoundingBox();
                        distance = dist;
                        logger.debug("check distance: " + dist);

                    }
                }
                if (!p.equals("anything")) {
                    for (Hypothesis h : obj.getHypotheses()) {
                        if (h.getClassLabel().equals(p)) {
                            if (h.getReliability() > curRel) {
                                curRel = h.getReliability();
                                candidate = obj.getBoundingBox();
                            }
                        }
                    }
                }
            }

        }

        if (candidate != null) {
            wanted = candidate;
            Pose3D tar = wanted.getPose();
            String frame = tar.getTranslation().getFrameId();
            logger.debug("in frame:" + frame);

            Point3D cur = wanted.getPose().getTranslation();
            Point3D moved = new Point3D(cur.getX(LengthUnit.METER),
                    cur.getY(LengthUnit.METER),
                    cur.getZ(LengthUnit.METER),
                    LengthUnit.METER);
            moved.setFrameId(frame);

            logger.debug("end distance: " + moved.distance(center));
            tar.setTranslation(moved);
            tar.setFrameId(frame);

            wanted.setPose(tar);
            wanted.setFrameId(frame);

            return tokenSuccess;
        } else {
            return tokenError;
        }

    }
}
