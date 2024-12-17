package de.unibi.citec.clf.bonsai.skills.objectPerception.deprecated;

import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.knowledgebase.RCObject;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

/**
 * Robot checks for the existence of a specific object or objects from a given category
 *
 * @author ffriese, pvonneumanncosel
 */
@Deprecated
public class CheckForObject extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNotFound;
    private ExitToken tokenError;

    private static final String MODE_KEY = "#_MODE";

    String mode;
    String objectName;
    String categoryName;

    List<ObjectShapeData> objectList;

    private MemorySlotReader<ObjectShapeList> objectsRecognizedSlot;
    private MemorySlot<String> objectNameSlot;
    private MemorySlotReader<String> categoryNameSlot;

    private KBaseActuator kBaseActuator;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        tokenSuccessNotFound = configurator.requestExitToken(ExitStatus.SUCCESS().ps("NotFound"));

        mode = configurator.requestValue(MODE_KEY).toUpperCase();

        if (mode.equals("CATEGORY")) {
            kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
        }

        objectsRecognizedSlot = configurator.getReadSlot("ObjectShapeListSlot", ObjectShapeList.class);
        objectNameSlot = configurator.getSlot("ObjectNameSlot", String.class);
        categoryNameSlot = configurator.getReadSlot("CategoryNameSlot", String.class);
    }

    @Override
    public boolean init() {
        try {
            objectName = objectNameSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("CommunicationException while recalling object name slot: " + ex.getMessage());
        }

        try {
            categoryName = categoryNameSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("CommunicationException while recalling object category slot: " + ex.getMessage());
        }

        try {
            objectList = objectsRecognizedSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("CommunicationException while recalling recognized objects slot: " + ex.getMessage());
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            switch (mode) {
                case "NAME":
                    for (ObjectShapeData object : objectList) {
                        if (object.getBestLabel().equals(objectName)) {
                            return tokenSuccess;
                        }
                    }
                    return tokenSuccessNotFound;
                case "CATEGORY":
                    List<RCObject> cat_objects = kBaseActuator.getBDOByAttribute(RCObject.class, "category", categoryName);
                    for (ObjectShapeData object : objectList) {
                        for (RCObject cat_obj : cat_objects) {
                            if (object.getBestLabel().equals(cat_obj.getName())) {
                                objectName = object.getBestLabel();
                                return tokenSuccess;
                            }
                        }
                    }
                    return tokenSuccessNotFound;
                default:
                    logger.error("incorrect mode: '" + mode + "'. must be either 'NAME' or 'CATEGORY'");
                    return tokenError;
            }
        } catch (KBaseActuator.BDONotFoundException e) {
            logger.error("Could not find any objects for category '" + categoryName + "': " + e.getMessage());
            return tokenError;
        }
    }

    /*
     * write results to location defined in objectsRecognizedMemoryActuator.
     * 
     * @see de.unibi.citec.clf.bonsai.engine.abstractskills.AbstractSkill#end()
     */
    @Override
    public ExitToken end(ExitToken curToken) {

        if (curToken.equals(tokenSuccess)) {
            try {
                objectNameSlot.memorize(objectName);
            } catch (CommunicationException ex) {
                logger.error("Could not save object name");
            }
        }
        return tokenSuccess;

    }
}
