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

/**
 * This Skill is used to filter a List of RCObjects by one or more specific attributes.
 * These Attributes can be any of the Attributes found in RCObject, i.e. category, location, shape, size and
 * weight. They are read via Slots (see below). Multiple values can be given, if the e.g. categories are seperated by
 * colons (":")
 * <pre>
 * TODO DOKU!
 * Options:
 *
 * Slots:
 *  RCObjectListReadSlot: [List<RCObject>] [Read]
 *      -> Memory slot the unfiltered list of RCObject will be read from
 *  RCObjectListWriteSlot: [List<RCObject>] [Write]
 *      -> Memory slot the filtered list of RCObject will be written to
 *
 *  NameSlot: [String] [Read]
 *      -> Memory Slot for the Name by that shall be filtered
 *  LocationSlot: [String] [Read]
 *      -> Memory Slot for the Location by that shall be filtered
 *  CategorySlot: [String] [Read]
 *      -> Memory Slot for the Category by that shall be filtered
 *  ShapeSlot: [String] [Read]
 *      -> Memory Slot for the Shape by that shall be filtered
 *  ColorSlot: [String] [Read]
 *      -> Memory Slot for the Color by that shall be filtered
 *  SizeSlot: [String] [Read]
 *      -> Memory Slot for the Size by that shall be filtered
 *  WeightSlot: [String] [Read]
 *      -> Memory Slot for the Weight by that shall be filtered
 *
 *
 * ExitTokens:
 *  success:                List successfully filtered, at least one RCObject remaining
 *  success.noObject        List successfully filtered, but no RCObject remaining/ List empty
 *  error:                  Name of the Location could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class SelectObjectFromProp extends AbstractSkill {
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private KBaseActuator kBaseActuator;

    private MemorySlotReader<List<RCObject>> rcobjectListSlot;
    private MemorySlotWriter<RCObject> rcobjectWriteSlot;
    private MemorySlotReader<String> propertySlot;

    private List<RCObject> rcObjectList;
    private RCObject rcObject;
    private String property;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);

        rcobjectListSlot = configurator.getReadSlot("RCObjectListSlot", List.getListClass(RCObject.class));
        rcobjectWriteSlot = configurator.getWriteSlot("RCObjectSlot", RCObject.class);
        propertySlot = configurator.getReadSlot("PropertySlot", String.class);
    }

    @Override
    public boolean init() {
        try {
            rcObjectList = rcobjectListSlot.recall();
            property = propertySlot.recall();


            if (rcObjectList == null) {
                logger.error("your RCObjectListSlot was empty");
                return false;
            }
            if (property == null) {
                logger.error("your propertySlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        rcObject = null;
        int bestValue;
        switch (property){
            case "biggest":
            case "largest":
                bestValue = Integer.MIN_VALUE;
                for (RCObject object : rcObjectList) {
                    if(object.getSize() > bestValue){
                        bestValue = object.getSize();
                        rcObject = object;
                    }
                }
                break;
            case "smallest":
            case "thinnest":
                bestValue = Integer.MAX_VALUE;
                for (RCObject object : rcObjectList) {
                    if(object.getSize() < bestValue){
                        bestValue = object.getSize();
                        rcObject = object;
                    }
                }
                break;
            case "heaviest":
                bestValue = Integer.MIN_VALUE;
                for (RCObject object : rcObjectList) {
                    if(object.getWeight() > bestValue){
                        bestValue = object.getSize();
                        rcObject = object;
                    }
                }
                break;
            case "lightest":
                bestValue = Integer.MAX_VALUE;
                for (RCObject object : rcObjectList) {
                    if(object.getWeight() < bestValue){
                        bestValue = object.getSize();
                        rcObject = object;
                    }
                }
                break;
            case "default":
                logger.error("unknown object property: " + property);
                break;
        }
        if(rcObject == null){
            return tokenError;
        }
        logger.info("selected object \"" + rcObject.getName() + "\" based on property \"" + property + "\"");
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                rcobjectWriteSlot.memorize(rcObject);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize rcObject");
                return tokenError;
            }
        }
        return curToken;
    }
}
