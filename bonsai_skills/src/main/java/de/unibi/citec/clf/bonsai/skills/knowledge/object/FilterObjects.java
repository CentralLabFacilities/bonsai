package de.unibi.citec.clf.bonsai.skills.knowledge.object;

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

import java.util.LinkedList;

/**
 * This Skill is used to filter a List of RCObjects by one or more specific attributes.
 * These Attributes can be any of the Attributes found in RCObject, i.e. category, location, shape, size and
 * weight. They are read via Slots (see below). Multiple values can be given, if the e.g. categories are separated by
 * colons (":")
 * <pre>
 *
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
 * @author rfeldhans
 */
@Deprecated
public class FilterObjects extends AbstractSkill {
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNoObject;
    private ExitToken tokenError;

    private MemorySlotReader<List<RCObject>> rcobjectReadSlot;
    private MemorySlotWriter<List<RCObject>> rcobjectWriteSlot;
    private MemorySlotReader<String> nameSlot;
    private MemorySlotReader<String> locationSlot;
    private MemorySlotReader<String> categorySlot;
    private MemorySlotReader<String> shapeSlot;
    private MemorySlotReader<String> colorSlot;

    private List<RCObject> rcObjectList;
    private LinkedList<String> names;
    private LinkedList<String> locations;
    private LinkedList<String> categorys;
    private LinkedList<String> shapes;
    private LinkedList<String> colors;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNoObject = configurator.requestExitToken(ExitStatus.SUCCESS().ps("noObject"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        rcobjectReadSlot = configurator.getReadSlot("RCObjectListReadSlot", List.getListClass(RCObject.class));
        rcobjectWriteSlot = configurator.getWriteSlot("RCObjectListWriteSlot", List.getListClass(RCObject.class));
        nameSlot = configurator.getReadSlot("NameSlot", String.class);
        locationSlot = configurator.getReadSlot("LocationSlot", String.class);
        categorySlot = configurator.getReadSlot("CategorySlot", String.class);
        shapeSlot = configurator.getReadSlot("ShapeSlot", String.class);
        colorSlot = configurator.getReadSlot("ColorSlot", String.class);
    }

    @Override
    public boolean init() {
        try {
            rcObjectList = rcobjectReadSlot.recall();

            if (rcObjectList == null) {
                logger.error("your RCObjectListReadSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        String nameString = "";
        String locationString = "";
        String categoryString = "";
        String shapeString = "";
        String colorString = "";
        names = new LinkedList<>();
        locations = new LinkedList<>();
        categorys = new LinkedList<>();
        shapes = new LinkedList<>();
        colors = new LinkedList<>();
        try {
            nameString = nameSlot.recall();

            if (nameString == null || nameString.isEmpty()) {
                logger.debug("your NameSlot was empty, will not filter by name");
            } else {
                logger.info("will filter by names: " + nameString);
                for (String name : nameString.split(";")) {
                    names.add(name);
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        try {
            locationString = locationSlot.recall();

            if (locationString == null || locationString.isEmpty()) {
                logger.debug("your LocationSlot was empty, will not filter by location");
            } else {
                logger.info("will filter by locations: " + locationString);
                for (String loc : locationString.split(";")) {
                    locations.add(loc);
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        try {
            categoryString = categorySlot.recall();

            if (categoryString == null || categoryString.isEmpty() || categoryString.toLowerCase().equals("object")  || categoryString.toLowerCase().equals("objects")) {
                logger.debug("your CategorySlot was empty or did hold the literal string object or objects, will not filter by category");
            } else {
                logger.info("will filter by categories: " + categoryString);
                for (String cat : categoryString.split(";")) {
                    categorys.add(cat);
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        try {
            shapeString = shapeSlot.recall();

            if (shapeString == null || shapeString.isEmpty()) {
                logger.debug("your ShapeSlot was empty, will not filter by shape");
            } else {
                logger.info("will filter by shapes: " + shapeString);
                for (String shape : shapeString.split(";")) {
                    shapes.add(shape);
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        try {
            colorString = colorSlot.recall();

            if (colorString == null || colorString.isEmpty()) {
                logger.debug("your ColorSlot was empty, will not filter by color");
            } else {
                logger.info("will filter by colors: " + colorString);
                for (String color : colorString.split(";")) {
                    colors.add(color);
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        List<RCObject> filteredObjects = new List<>(RCObject.class);
        for (RCObject object : rcObjectList) {
            if (!names.isEmpty() && !names.contains(object.getName())){
                continue;
            }
            if (!locations.isEmpty() && !locations.contains(object.getLocation())){
                continue;
            }
            if (!categorys.isEmpty() && !categorys.contains(object.getCategory())) {
                continue;
            }
            if (!shapes.isEmpty() && !shapes.contains(object.getShape())){
                continue;
            }
            if (!colors.isEmpty() && !colors.contains(object.getColor())){
                continue;
            }
            filteredObjects.add(object);
        }
        rcObjectList = filteredObjects;
        if (rcObjectList.isEmpty()) {
            return tokenSuccessNoObject;
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                rcobjectWriteSlot.memorize(rcObjectList);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize rcObjectList");
                return tokenError;
            }
        }
        return curToken;
    }
}
