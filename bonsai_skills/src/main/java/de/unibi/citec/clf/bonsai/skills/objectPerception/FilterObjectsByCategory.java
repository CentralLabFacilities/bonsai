package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.knowledgebase.RCObject;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

/**
 * Removes all objects from list that do not belong to given category by using the kbase (ignore unkown, only use bestlabel)
 * (accidently made this, but not needed so far)
 * whoever wants to use this: test first
 *
 * @author pvonneumanncosel
 */
public class FilterObjectsByCategory extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<ObjectShapeList> objectsRecognizedReadSlot;
    private MemorySlotWriter<ObjectShapeList> objectsRecognizedWriteSlot;
    private MemorySlotReader<String> categorySlot;

    private KBaseActuator kBaseActuator;

    private ObjectShapeList objects;
    private String category;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        objectsRecognizedReadSlot = configurator.getReadSlot("ObjectShapeListReadSlot", ObjectShapeList.class);
        objectsRecognizedWriteSlot = configurator.getWriteSlot("ObjectShapeListWriteSlot", ObjectShapeList.class);
        categorySlot = configurator.getReadSlot("CategorySlot", String.class);

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
    }

    @Override
    public boolean init() {
        try {
            objects = objectsRecognizedReadSlot.recall();
            category = categorySlot.recall();

        } catch (CommunicationException ex) {
            logger.error(ex.getMessage());
            return false;
        }

        if(category == null){
            logger.debug("no category given, nothing to be done, not removing any items from the list");
        }

        if (objects == null) {
            logger.debug("no objects recognized before, nothing to be done, but to create an empty list for you");
            objects = new ObjectShapeList();
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        for (ObjectShapeData obj : objects) {
            if(!checkIfObjectsBelongsToCategory(obj, category)){
                objects.remove(obj);
                logger.debug("removed object with label " + obj.getBestLabel());
            }
        }
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

    private boolean checkIfObjectsBelongsToCategory(ObjectShapeData obj, String category){
        try {
            RCObject object = kBaseActuator.getRCObjectByName(obj.getBestLabel());
            if(object.getCategory().equals(category)){
                logger.debug(obj.getBestLabel() + " belongs to "+ category);
                return true;
            }else{
                logger.debug(obj.getBestLabel() + " DOES NOT belong to "+ category);
                return false;
            }
        } catch (KBaseActuator.BDONotFoundException e) {
            logger.error("cant resolve object from kbase (not keeping it in list) " + obj.getBestLabel() + " " + e.getMessage());
        }
        return false;
    }
}
