package de.unibi.citec.clf.bonsai.skills.objectPerception;


import de.unibi.citec.clf.bonsai.actuators.SegmentationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * This Skill is used for retrieving the room the robot is currently in.
 * <pre>
 *

 * Options:
 *  #_TIMEOUT           [long] Optional (default: 7000)
 *      -> Amount of time robot searches for a person before notFound is sent in ms
 *
 * Slots:
 *  LabelSlot: [String] [Read]
 *      -> Memory slot with the label of the objects to segment
 *  ObjectShapeListSlot: [ObjectShapeList] [Write]
 *      -> Memory slot where the list of segmented objects will be written to
 *
 * ExitTokens:
 *  success.ObjectsFound:      Objects could be segmented
 *  success.NoObjectsFound:    Objects could be segmented, but none (with the right label) could be found
 *  success.Timeout:            Objects could not be segmented, due to taking to long
 *  error:      Some sort of error occured
 *
 * Sensors:
 *
 * Actuators:
 *  SegmentationActuator: [SegmentationActuator]
 *      -> Called to segment the objects
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
public class SegmentObjects extends AbstractSkill {
    private String KEY_TIMEOUT = "#_TIMEOUT";

    private ExitToken tokenSuccessObjects;
    private ExitToken tokenSuccessNoObjects;
    private ExitToken tokenSuccessTimeout;
    private ExitToken tokenError;
    private ExitToken tokenLoopDiLoop = ExitToken.loop(50);

    private MemorySlotReader<String> labelSlot;
    private MemorySlotWriter<ObjectShapeList> objectShapeListSlot;

    private SegmentationActuator segmentationActuator;

    private ObjectShapeList objectShapeList;
    private long timeout = 20000;

    private Future<ObjectShapeList> future;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccessObjects = configurator.requestExitToken(ExitStatus.SUCCESS().ps("ObjectsFound"));
        tokenSuccessNoObjects = configurator.requestExitToken(ExitStatus.SUCCESS().ps("NoObjectsFound"));
        tokenSuccessTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("Timeout"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int)timeout);

        labelSlot = configurator.getReadSlot("LabelSlot", String.class);
        objectShapeListSlot = configurator.getWriteSlot("ObjectShapeListSlot", ObjectShapeList.class);

        segmentationActuator = configurator.getActuator("SegmentationActuator", SegmentationActuator.class);
    }

    @Override
    public boolean init() {
        String label;
        try {
            label = labelSlot.recall();

            if (label == null) {
                logger.warn("your LabelSlot was empty, will just assume \"\"");
                label = "";
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }

        try {
            future = segmentationActuator.segment(label);
        } catch (IOException e) {
            logger.fatal(e.getMessage());
            return false;
        }

        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + " ms");
            timeout += System.currentTimeMillis();
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (System.currentTimeMillis() > timeout) {
            logger.error("reached timeout");
            return tokenSuccessTimeout;
        }

        if (!future.isDone()){
            return tokenLoopDiLoop;
        }

        try {
            objectShapeList = future.get();
        } catch (InterruptedException | ExecutionException e) {
            logger.fatal(e.getMessage());
            return tokenError;
        }

        if(objectShapeList.isEmpty()){
            return tokenSuccessNoObjects;
        }else{
            return tokenSuccessObjects;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                objectShapeListSlot.memorize(objectShapeList);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize roomName");
                return tokenError;
            }
        }
        return curToken;
    }

}
