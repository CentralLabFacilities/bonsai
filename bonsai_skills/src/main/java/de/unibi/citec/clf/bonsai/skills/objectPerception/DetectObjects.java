package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.actuators.ObjectDetectionActuator;
import de.unibi.citec.clf.bonsai.actuators.RecognizeObjectsActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Robot detects objects
 * <pre>
 *
 * Slots:
 *  ObjectShapeListSlot: [ObjectShapeList] [Write]
 *      -> Memory slot the detected objects will be written to
 *
 * ExitTokens:
 *  success:                Successfully detected at least one Object
 *  success.noObjects:      Successfully detected no object (i.e. there was no error and no object)
 *  error:                  Could not successfully detect
 *
 * Sensors:
 *
 * Actuators:
 *  ObjectDetectionActuator: [ObjectDetectionActuator]
 *      -> Called to detect the objects
 *
 * </pre>
 *
 * @author lruegeme
 */
public class DetectObjects extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNoObjects;
    private ExitToken tokenError;

    private MemorySlotWriter<ObjectShapeList> objectsRecognizedSlot;

    private ObjectDetectionActuator detectObjectsActuator;

    private Future<List<ObjectShapeData>> ret;
    private List<ObjectShapeData> objectList;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNoObjects = configurator.requestExitToken(ExitStatus.SUCCESS().ps("noObjects"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        objectsRecognizedSlot = configurator.getWriteSlot("ObjectShapeListSlot", ObjectShapeList.class);
        detectObjectsActuator = configurator.getActuator("ObjectDetectionActuator", ObjectDetectionActuator.class);
    }

    @Override
    public boolean init() {
        try {
            ret = detectObjectsActuator.detectObjects(null);
        } catch (IOException e) {
            logger.error(e);
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if(!ret.isDone()) {
            return ExitToken.loop();
        }

        try {
            objectList = ret.get();
        } catch (InterruptedException | ExecutionException e) {
            logger.fatal(e);
            return ExitToken.fatal();
        }

        if(objectList.isEmpty()) {
            return tokenSuccessNoObjects;
        }

        for(ObjectShapeData osd : objectList) {
            logger.debug("found object: " + osd.getId()
                    + " at " + osd.getBoundingBox().getPose()
                    + " is " + osd.getBestLabel());
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        if (curToken.getExitStatus().isSuccess()) {
            ObjectShapeList tmp = new ObjectShapeList();
            tmp.addAll(objectList);
            try {
                objectsRecognizedSlot.memorize(tmp);
            } catch (CommunicationException ex) {
                logger.error("Could not save objects");
                return tokenError;
            }
        }
        return curToken;

    }
}
