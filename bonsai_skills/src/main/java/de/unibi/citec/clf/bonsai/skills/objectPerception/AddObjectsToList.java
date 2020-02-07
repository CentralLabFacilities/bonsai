package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

/**
 * Adds objects to a list of objects (unique labels, ignore unknown, only use bestlabel)
 *
 * @author pvonneumanncosel
 */
public class AddObjectsToList extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<ObjectShapeList> newObjectsRecognizedReadSlot;
    private MemorySlotReader<ObjectShapeList> objectsRecognizedReadSlot;
    private MemorySlotWriter<ObjectShapeList> objectsRecognizedWriteSlot;

    private ObjectShapeList newObjects;
    private ObjectShapeList objects;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        newObjectsRecognizedReadSlot = configurator.getReadSlot("NewObjectShapeListReadSlot", ObjectShapeList.class);
        objectsRecognizedReadSlot = configurator.getReadSlot("ObjectShapeListReadSlot", ObjectShapeList.class);
        objectsRecognizedWriteSlot = configurator.getWriteSlot("ObjectShapeListWriteSlot", ObjectShapeList.class);
    }

    @Override
    public boolean init() {
        try {
            newObjects = newObjectsRecognizedReadSlot.recall();
            objects = objectsRecognizedReadSlot.recall();

        } catch (CommunicationException ex) {
            logger.error(ex.getMessage());
            return false;
        }

        if (newObjects == null) {
            logger.error("no objects recognized before, nothing to be done");
            newObjects = new ObjectShapeList();
        }

        if (objects == null) {
            logger.debug("no objects in goal slots, creating empty list");
            objects = new ObjectShapeList();
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        for (ObjectShapeData obj : newObjects) {
            if(!checkIfLabelInList(objects, obj)){
                objects.add(obj);
                logger.debug("added new objs to list with label " + obj.getBestLabel());
            }
        }
        logger.info("list is " + objects.toString());
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.equals(tokenSuccess)) {
            try {
                objectsRecognizedWriteSlot.memorize(objects);
            } catch (CommunicationException ex) {
                logger.error("Could not save objects");
                return tokenError;
            }
        }
        return tokenSuccess;
    }

    private boolean checkIfLabelInList(ObjectShapeList list, ObjectShapeData obj){
        String label = obj.getBestLabel();
        for (ObjectShapeData listObj : list) {
            if(listObj.getBestLabel().equals(label)){
                return true;
            }
        }
        return false;
    }
}
