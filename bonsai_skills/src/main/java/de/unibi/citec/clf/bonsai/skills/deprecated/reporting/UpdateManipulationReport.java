package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.PdfWriter;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Set;

/**
 *
 * @author kgardeja
 */
public class UpdateManipulationReport extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private static final String TYPE = "#_TYPE";

    //TODO ersetzen durch "echte" Paths: simbolic link to stick
    /**
     * path where to find the images and the tex-file.
     */
    private static final String PATH = "/home/biron/Desktop/";
    /**
     * the name of the pdf.
     */
    private static final String PDFNAME = "reportManipulationTask.tex";

    private static final String ROLLING_IMAGE_NAME = "/home/biron/image_objects.jpg";
    /**
     * logger.
     */
    private static final org.apache.log4j.Logger LOGGER = org.apache.log4j.Logger.getLogger(WritePositionToMap.class);
    /**
     * Variables from SCXML file.
     */
    private Integer counter;
    private String object;
    //private Polygon poly;

    private MemorySlot<String> stringSlot;
    private MemorySlot<ObjectShapeData> graspObjSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        logger.debug("USBPath is: " + PATH);
        stringSlot = configurator.getSlot("stringSlot", String.class);
        graspObjSlot = configurator.getSlot(
                "graspObjSlot", ObjectShapeData.class);
    }

    @Override
    public boolean init() {
        try {
            if (stringSlot.recall() == null) {
                counter = 1;
                stringSlot.memorize(counter.toString());
            } else {
                counter = Integer.valueOf(stringSlot.recall());
            }
        } catch (CommunicationException ex) {
            logger.error("exception", ex);
            return false;
        }

        ObjectShapeData obj = null;
        try {
            obj = graspObjSlot.recall();
        } catch (CommunicationException ex) {
            logger.warn(ex.getMessage());
            return false;
        }

        if (obj == null) {
            logger.error("Error: No Object to speak about!...");
            return false;
        }

        Set<ObjectShapeData.Hypothesis> hypos = obj.getHypotheses();
        ObjectShapeData.Hypothesis best = null;
        // iterate over all hypos from the object.
        double bestRel = 0.0;
        for (ObjectShapeData.Hypothesis h : hypos) {
            if (h.getReliability() > bestRel) {
                bestRel = h.getReliability();
                best = h;
            }
        }

        if (best == null) {
            logger.error("Error: No hypo to speak about!...");
            return false;
        }

        object = best.getClassLabel();
        //poly = obj.getPolygon();

        return true;
    }

    @Override
    public ExitToken execute() {
        String filename = PATH + PDFNAME;
        String filenameImage = PATH + "/img" + System.currentTimeMillis() + ".jpg";
        logger.debug("DEBUG: TEXFILE WIRD AKTUALISIERT ==============");
        //PdfWriter.writeTextInFile(filename,counter + ". recognized Object: " + object + "\\\\" + "\\\\");
        try {
            Files.copy(Paths.get(ROLLING_IMAGE_NAME), Paths.get(filenameImage));
            //PdfWriter.addImageWithPolygon(filename, filenameImage, poly, object, 0.7);
        } catch (IOException e) {
            logger.error("Unable copy image file: " + ROLLING_IMAGE_NAME + " -> " + filenameImage, e);
        }
        //PdfWriter.createPDFFile(filename, PATH);
        counter++;
        try {
            stringSlot.memorize(counter.toString());
        } catch (CommunicationException ex) {
            logger.error("Unable to write to memory: " + ex.getMessage());
        }
        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {

        return tokenSuccess;
    }

}
