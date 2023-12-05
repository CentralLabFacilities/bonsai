package de.unibi.citec.clf.bonsai.skills.knowledge.object;

import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.knowledgebase.RCObject;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;


/**
 * This Skill converts a ObjectShapeDataList to a List of RCObjects.
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  ObjectShapeListSlot: [ObjectShapeList] [Read]
 *      -> Memory slot where the Objects in ObjectShapeDataList form will be read from
 *  RCObjectListSlot: [RCobject] [Write]
 *      -> Memory slot where the Objects in RCObject form will be written to
 *
 * ExitTokens:
 *  success:                Objects successfully converted
 *  error:                  Objects could not be successfully converted
 *
 * Sensors:
 *
 * Actuators:
 *  KBaseActuator: [KBaseActuator]
 *      -> Called to match the ObjectShapeData to RCObject
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
@Deprecated
public class ConvertShapeDataToRCObject extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<ObjectShapeList> objectShapeListSlot;
    private MemorySlotWriter<List<RCObject>> rcobjectSlot;

    private KBaseActuator kBaseActuator;

    private ObjectShapeList objectShapeList;
    private List<RCObject> rcObjectList;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        objectShapeListSlot = configurator.getReadSlot("ObjectShapeListSlot", ObjectShapeList.class);
        rcobjectSlot = configurator.getWriteSlot("RCObjectListSlot", List.getListClass(RCObject.class));

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
    }

    @Override
    public boolean init() {
        try {
            objectShapeList = objectShapeListSlot.recall();

            if (objectShapeList == null) {
                logger.error("your ObjectShapeListSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        rcObjectList = new List<>(RCObject.class);

        return true;
    }

    @Override
    public ExitToken execute() {
        for(ObjectShapeData objectShapeData : objectShapeList){
            try {
                RCObject rcObject = kBaseActuator.getRCObjectByName(objectShapeData.getBestLabel());
                rcObjectList.add(rcObject);
            } catch (KBaseActuator.BDONotFoundException e) {
                logger.error("Could not convert ObjectShapeData with label \"" + objectShapeData.getBestLabel() + "\" to RCObject: " + e.getMessage());
            }
        }
        if(rcObjectList.isEmpty()){
           return tokenError;
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                rcobjectSlot.memorize(rcObjectList);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize RCObjectList");
                return tokenError;
            }
        }
        return curToken;
    }
}
