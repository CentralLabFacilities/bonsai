package de.unibi.citec.clf.bonsai.skills.objectPerception;

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

import java.util.concurrent.ExecutionException;

/**
 * Robot recognizes objects and prepares to write them into report file
 * <pre>
 *
 *
 * Slots:
 *  ObjectShapeListSlot: [ObjectShapeList] [Write]
 *      -> Memory slot the recognized objects will be written to
 *
 * ExitTokens:
 *  success:                Successfully recognized at least one Object
 *  success.noObjects:      Successfully recognized no object (i.e. there was no error and no object)
 *  error:                  Could not successfully recognize
 *
 * Sensors:
 *
 * Actuators:
 *  RecognizeObjectsActuator: [RecognizeObjectsActuator]
 *      -> Called to recognize the objects
 *
 *
 * </pre>
 *
 * @author jkummert
 */
public class RecognizeObjects extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNoObjects;
    private ExitToken tokenError;

    private MemorySlotWriter<ObjectShapeList> objectsRecognizedSlot;

    private RecognizeObjectsActuator recognizeObjectsActuator;

    private List<ObjectShapeData> objectList;


    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNoObjects = configurator.requestExitToken(ExitStatus.SUCCESS().ps("noObjects"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        objectsRecognizedSlot = configurator.getWriteSlot("ObjectShapeListSlot", ObjectShapeList.class);

        recognizeObjectsActuator = configurator.getActuator("RecognizeObjectsActuator", RecognizeObjectsActuator.class);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {

        try {
            objectList = recognizeObjectsActuator.recognize();
        } catch (InterruptedException | ExecutionException ex) {
            logger.error("Could not recognize objects: " + ex);
            return tokenError;
        }

        if(objectList == null){
            return tokenSuccessNoObjects;
        }
        if (objectList.isEmpty()) {
            return tokenSuccessNoObjects;
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        if (curToken.equals(tokenSuccess)) {
            ObjectShapeList tmp = new ObjectShapeList();
            tmp.addAll(objectList);
            try {
                objectsRecognizedSlot.memorize(tmp);
            } catch (CommunicationException ex) {
                logger.error("Could not save objects");
                return tokenError;
            }
        }
        return tokenSuccess;

    }
}
