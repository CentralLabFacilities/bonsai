package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.PdfWriter;
import de.unibi.citec.clf.btl.data.object.ObjectLocationList;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author kgardeja,llach
 */
public class PrintBestObjects extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private static final String MAX_OBJECTS = "#_MAX_OBJECTS";

    private String FILENAME;
    private String PATH;

    private String conImage;
    private static final double deviation = 70;
    java.util.List<java.util.Map.Entry<Double, String>> texObjectsList;

    private static final org.apache.log4j.Logger LOGGER = org.apache.log4j.Logger.getLogger(WritePositionToMap.class);
    String objectsList = "";

    private static Integer counter;

    private MemorySlot<String> imageNameSlot;
    private MemorySlot<String> filenameSlot;
    private MemorySlot<String> pathSlot;
    private MemorySlot<String> texListSlot;

    private ObjectLocationList objects2d = null;
    private ObjectShapeList objects = null;
    private ObjectShapeList knownObjects = null;

    Future<Boolean> b;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        imageNameSlot = configurator.getSlot("ImageNameSlot", String.class);
        pathSlot = configurator.getSlot("pathSlot", String.class);
        filenameSlot = configurator.getSlot("filenameSlot", String.class);
        texListSlot = configurator.getSlot(
                "TexSnippetsList", String.class);
    }

    @Override
    public boolean init() {
        counter = 0;
        try {
            conImage = imageNameSlot.recall();
        } catch (CommunicationException ex) {
            logger.debug("Unabel to recall Imagename");
            return false;
        }

        try {
            objectsList = texListSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("exception", ex);
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (PATH == null || PATH.isEmpty()) {
            logger.fatal("Path was null. Maybe the report was not prepared?");
            return ExitToken.fatal();
        }
//        java.util.Map.Entry<Double, String> pair = new java.util.AbstractMap.SimpleEntry<>(obj2d.getBestRel(), objStr);
        texObjectsList = getObjectEntries(objectsList);
        Collections.sort(texObjectsList, (a, b) -> b.getKey().compareTo(a.getKey()));
        String filenameTex = PATH + FILENAME;

        for (java.util.Map.Entry<Double, String> pair : texObjectsList) {
            if (counter > 4) {
                break;
            }
            //PdfWriter.writeTextInFile(filenameTex, pair.getValue());
            counter++;
        }

        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        try {
            imageNameSlot.forget();
        } catch (CommunicationException ex) {
            Logger.getLogger(UpdateManipulationReportMulti.class.getName()).log(Level.SEVERE, null, ex);
        }

        return curToken;
    }

    private boolean isKnown(ObjectShapeData obj) {
        if (knownObjects.isEmpty() || knownObjects == null) {
            logger.debug("known objects was empty");
            knownObjects.add(obj);
            return false;
        }

        logger.debug("got center at: " + obj + "\n");

        for (ObjectShapeData knownObj : knownObjects) {
            logger.debug("comparing with center: " + knownObj + "\n");

            if (((knownObj.getCenter().getZ(LengthUnit.MILLIMETER) + deviation) > obj.getCenter().getZ(LengthUnit.MILLIMETER)
                    && (knownObj.getCenter().getZ(LengthUnit.MILLIMETER) - deviation) < obj.getCenter().getZ(LengthUnit.MILLIMETER))
                    && ((knownObj.getCenter().getY(LengthUnit.MILLIMETER) + deviation) > obj.getCenter().getY(LengthUnit.MILLIMETER)
                    && (knownObj.getCenter().getY(LengthUnit.MILLIMETER) - deviation) < obj.getCenter().getY(LengthUnit.MILLIMETER))
                    && ((knownObj.getCenter().getX(LengthUnit.MILLIMETER) + deviation) > obj.getCenter().getX(LengthUnit.MILLIMETER)
                    && (knownObj.getCenter().getX(LengthUnit.MILLIMETER) - deviation) < obj.getCenter().getX(LengthUnit.MILLIMETER))) {

                logger.debug("detected known object");
                return true;
            }
        }

        logger.debug("object isn't known");
        knownObjects.add(obj);
        return false;
    }

    private java.util.List<Map.Entry<Double, String>> getObjectEntries(String obj) {
        java.util.List<Map.Entry<Double, String>> retList = new java.util.ArrayList<>();
        String[] parts1 = obj.split("@");

        for (String part1 : parts1) {
            String[] parts2 = part1.split("§");
            java.util.Map.Entry<Double, String> pair = new java.util.AbstractMap.SimpleEntry<>(Double.parseDouble(parts2[0]), parts2[1]);
            retList.add(pair);
        }
        return retList;
    }
}
