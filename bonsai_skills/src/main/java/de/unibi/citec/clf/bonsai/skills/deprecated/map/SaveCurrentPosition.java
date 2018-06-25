package de.unibi.citec.clf.bonsai.skills.deprecated.map;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.map.AnnotationList;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import java.io.IOException;
import java.util.LinkedList;

/**
 *
 * @author cklarhorst
 */
@Deprecated
public class SaveCurrentPosition extends AbstractSkill {

    private static final String KEY_DIRECTION = "#_DIRECTION";
    private static final String KEY_LABEL = "#_LABEL";
    private static final String KEY_SLOT = "#_USE_SLOT";
    //TODO possible to add on annotation list
    private static final String KEY_LIST = "#_ADDTOLIST";

    //defaults
    private boolean useSlot = false;
    private String direction = "front";
    private String label = "";
    private String list = "";

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private Sensor<PositionData> positionSensor;
    private PositionData posData;
    private MemorySlot<Viewpoint> viewpointMemorySlot;
    private MemorySlot<String> labelSlot;
    private MemorySlot<AnnotationList> annotationSlot;
    private Viewpoint vp;
    private AnnotationList al;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        direction = configurator.requestOptionalValue(KEY_DIRECTION, direction);
        label = configurator.requestOptionalValue(KEY_LABEL, label);
        list = configurator.requestOptionalValue(KEY_LIST, list);
        useSlot = configurator.requestOptionalBool(KEY_SLOT, useSlot);

        if (!list.isEmpty()) {
            annotationSlot = configurator.getSlot("AnnotationListSlot", AnnotationList.class);
        } else {
            viewpointMemorySlot = configurator.getSlot("ViewpointSlot", Viewpoint.class);
        }

        if (useSlot) {
            if (!label.isEmpty()) {
                logger.warn("label overwritten via slot");
            }
            labelSlot = configurator.getSlot("ViewpointLabelSlot", String.class);
        }

        if (!(direction.equals("front") || direction.equals("left") || direction.equals("right") || direction.equals("back"))) {
            String ex = "direction is: " + direction + "should be front||left||right||back";
            logger.fatal(ex);
            throw new SkillConfigurationException(ex);
        }

    }

    @Override
    public boolean init() {

        try {
            if (useSlot) {
                label = labelSlot.recall();
            }
            if (label == null || label.isEmpty()) {
                logger.error("label is empty string or null");
                return false;
            }
            if (!list.isEmpty()) {
                al = annotationSlot.recall();
                if (al == null) {
                    al = new AnnotationList();
                    logger.warn("created annotation list");
                }
            }

            posData = positionSensor.readLast(2000);
            logger.info("Read current position: " + posData.toString());
            return true;
        } catch (IOException | CommunicationException | InterruptedException e) {
            logger.error(e.getMessage());
            return false;
        }
    }

    @Override
    public ExitToken execute() {
        if (posData == null) {
            logger.error("PositionData is null");
            return tokenError;
        }

        logger.info("Read yaw rad" + posData.getYaw(AngleUnit.RADIAN));
        double currentYaw = posData.getYaw(AngleUnit.DEGREE);
        switch (direction) {
            case "back":
                posData.setYaw(currentYaw - 180, AngleUnit.DEGREE);
                break;
            case "left":
                posData.setYaw(currentYaw + 90, AngleUnit.DEGREE);
                break;
            case "right":
                posData.setYaw(currentYaw - 90, AngleUnit.DEGREE);
                break;
        }
        logger.info("direction: " + direction + "  set yaw rad: " + posData.getYaw(AngleUnit.RADIAN));
        logger.info("pdata: " + (posData.toString()));
        vp = new Viewpoint(posData, label);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (vp == null) {
                logger.debug("vp is null");
                return ExitToken.fatal();
            }
            try {

                if (!list.isEmpty()) {
                    setAnnotation();
                    annotationSlot.memorize(al);
                } else {
                    viewpointMemorySlot.memorize(vp);
                }

                return curToken;

            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }

        return curToken;
    }

    private void setAnnotation() {
        Annotation a = null;
        int i;
        for (i = 0; i < al.size(); i++) {
            a = al.get(i);
            if (a.getLabel().equals(list)) {
                break;
            } else {
                a = null;
            }
        }
        if (a == null) {
            logger.debug("annotation " + label + " not found, adding to list");
            a = new Annotation(list, new PrecisePolygon(), vp);
            al.add(a);
            //logger.debug("added to al:" + a.getLabel());
        } else {
            boolean replaced = false;
            LinkedList<Viewpoint> vl = a.getViewpoints();
            Viewpoint tmp;
            for (int j = 0; j < vl.size(); j++) {
                tmp = vl.get(j);
                if (tmp.getLabel().equals(vp.getLabel())) {
                    vl.set(j, vp);
                    replaced = true;
                    break;
                }
            }
            if (!replaced) {
                vl.add(vp);
            }
            a.setViewpoints(vl);
            al.set(i, a);
        }

        //logger.error("annotation list:");
        //for (Annotation an : al) {
        //    logger.error(" a:" + an.getLabel());
        //    for (Viewpoint v : an.getViewpoints()) {
        //        logger.error("   v:" + v.getLabel());
        //    }
        //}
    }
}
