package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.PdfWriter;
import de.unibi.citec.clf.btl.data.object.ObjectLocationData;
import de.unibi.citec.clf.btl.data.object.ObjectLocationList;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author kgardeja,llach
 */
public class UpdateManipulationReportMulti extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private static final String MAX_OBJECTS = "#_MAX_OBJECTS";
    private static final String MIN_REL = "#_MIN_REL";
    private String FILENAME;
    private String PATH;

    private String conImage;
    private static final double deviation = 70;

    private static final org.apache.log4j.Logger LOGGER = org.apache.log4j.Logger.getLogger(WritePositionToMap.class);

    private static Integer counter;

    /**
     * The maximum of objects to be published in the report. Beware: if you call this skill twice, to have matching
     * values. Default is from the rulebook.
     */
    private Integer maxObjects = 5;
    private double minRel = 0.3;

    private MemorySlot<String> counterSlot;
    private MemorySlot<String> filenameSlot;
    private MemorySlot<String> pathSlot;
    private MemorySlot<String> imageNameSlot;
    private MemorySlot<ObjectShapeList> objectsRecognizedSlot;
    private MemorySlot<ObjectLocationList> objectsRecognized2dSlot;
    private MemorySlot<ObjectShapeList> knownObjectsSlot;

    private ObjectLocationList objects2d = null;
    private ObjectShapeList objects = null;
    private ObjectShapeList knownObjects = null;

    Future<Boolean> b;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        pathSlot = configurator.getSlot("pathSlot", String.class);
        counterSlot = configurator.getSlot("counterSlot", String.class);
        filenameSlot = configurator.getSlot("filenameSlot", String.class);
        imageNameSlot = configurator.getSlot("ImageNameSlot", String.class);
        objectsRecognizedSlot = configurator.getSlot("objectsRecognizedSlot", ObjectShapeList.class);
        objectsRecognized2dSlot = configurator.getSlot("objectsRecognized2dSlot", ObjectLocationList.class);
        knownObjectsSlot = configurator.getSlot("KnownObjectsSlot", ObjectShapeList.class);

        maxObjects = configurator.requestOptionalInt(MAX_OBJECTS, maxObjects);
        minRel = configurator.requestOptionalDouble(MIN_REL, minRel);

    }

    @Override
    public boolean init() {

        logger.info("Objects for pdf: " + maxObjects);

        try {
            conImage = imageNameSlot.recall();
        } catch (CommunicationException ex) {
            logger.debug("Unabel to recall Imagename");
            return false;
        }

        try {

            if (counterSlot.recall() == null) {
                counter = 0;
                counterSlot.memorize(counter.toString());
            } else {
                counter = Integer.valueOf(counterSlot.recall());
            }

            FILENAME = filenameSlot.recall();
            PATH = pathSlot.recall();
            objects2d = objectsRecognized2dSlot.recall();
            objects = objectsRecognizedSlot.recall();
            knownObjects = knownObjectsSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("exception", ex);
            return false;
        }

        logger.debug("USBPath is: " + PATH);

        return true;
    }

    @Override
    public ExitToken execute() {
        if (PATH == null || PATH.isEmpty()) {
            logger.fatal("Path was null. Maybe the report was not prepared?");
            return ExitToken.fatal();
        }

        if (knownObjects == null) {
            logger.debug("no known objects so far");
            knownObjects = new ObjectShapeList();
        }

        String filenameTex = PATH + FILENAME;

        if (!Files.exists(Paths.get(conImage))) {
            logger.error("Image was not found! Exiting");
            return ExitToken.fatal();
        }

        if (objects == null || objects.isEmpty()) {
            logger.debug("No objetcs were found");
            return tokenError;

        }

        int objcount = 0;

        for (ObjectShapeData obj : objects) {

            if (counter >= maxObjects) {
                logger.debug("reached object limit of " + maxObjects);
                break;
            }

            logger.debug("checking object" + counter + " with KOsize: "
                    + knownObjects.size());

            if (obj.getBestLabel() == null || "unknown".equals(obj.getBestLabel())) {
                logger.error("Error: No hypo to speak about! or unknown Object...");
                objcount++;
                continue;
            }

            if (obj.getBestRel() < minRel) {
                logger.debug(obj.getBestLabel() + " with rel " + obj.getBestRel() + " not taken into report, cause it was lower than " + minRel);
                objcount++;
                continue;
            }

            if (isKnown(obj)) {
                objcount++;
                continue;
            }

            logger.debug("Objects size is " + objects.size());
            logger.debug("Added object " + obj + "\nwith id " + objcount + "(ShapeData index is " + objects.indexOf(obj) + ")");

            ObjectLocationData obj2d = objects2d.get(objcount);

            String object = obj2d.getBestLabel();
            object = object.replace("_", " ");
            object = object.replace("-", " ");
            //Polygon poly = obj2d.getPolygon();

            logger.debug("TEXFILE WIRD AKTUALISIERT");
            //PdfWriter.writeTextInFile(filenameTex, counter + ". recognized Object: " + object + "\\\\" + "\\\\");
            //PdfWriter.addImageWithPolygon(filenameTex, conImage, poly, object, 0.7);

            objcount++;
            counter++;
        }

        try {
            counterSlot.memorize(counter.toString());
            knownObjectsSlot.memorize(knownObjects);
        } catch (CommunicationException ex) {
            logger.error("Unable to write to memory: " + ex.getMessage());
        }

        return tokenSuccess;

    }

    public static class bestHypoComparator implements Comparator<ObjectLocationData> {

        @Override
        public int compare(ObjectLocationData a, ObjectLocationData b) {
            double aC = a.getBestRel();
            double bC = b.getBestRel();

            return aC < bC ? -1 : aC == bC ? 0 : 1;
        }
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

}
