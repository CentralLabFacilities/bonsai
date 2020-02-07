package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;


import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.awt.Image;
import java.io.File;
import java.io.IOException;
import java.util.Date;
import java.util.Map;
import javax.imageio.ImageIO;

/**
 * Marks the actual position to the image of the map. TYPE: decides which symbol
 * to use: fire or person The position of the person is also saved into a list.
 *
 * @author adreyer, kharmening
 */
public class WritePositionToMap extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    /**
     * decides which symbol to use.
     */
    private static final String TYPE = "#_TYPE";
    //TODO ersetzen durch "echten" Path: simbolic link to stick
    /**
     * path where to find the images.
     */
    private static final String PATH = "unsupported";//PdfWriter.getReportPath();
    /**
     * the name of the pdf.
     */
    private static final String PDFNAME = "reportTeamToBI.tex";
    /**
     * factor to convert the robotPosition to position in the map.
     */
    private static final double RATIOMETERPIXEL = 0.05;
    /**
     * decides which image to use. default: person
     */
    private String type = "person";
    /*
     * Images used in this task.
     */
    private Image map;
    private Image person;
    /**
     * PositionSensor.
     */
    
    private MemorySlot<PositionData> memorySlot;
    private PositionData posData;
    /**
     * Variables from SCXML file.
     */
    private Map<String, String> variables;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        logger.debug("USBPath is: " + PATH);
         // Initialize slots
       memorySlot = configurator.getSlot(
                "PositionMemorySlot", PositionData.class);
    }

    @Override
    public boolean init() {
        try {
            posData = memorySlot.recall();
            return true;
        } catch (CommunicationException ex) {
            logger.fatal("Memory read failed");
            return false;
        }
    }

    @Override
    public ExitToken execute() {
        logger.debug("write position to map");
        //calculate position in pixel-coordinates
        double xoffset = posData.getX(LengthUnit.METER);
        xoffset = xoffset / RATIOMETERPIXEL;
        double yoffset = posData.getY(LengthUnit.METER);
        yoffset = yoffset / RATIOMETERPIXEL;

        logger.debug("calculated offsets");
        
        //consider map height
        try {
            map = ImageIO.read(new File(PATH + "map.png"));
            yoffset = map.getHeight(null) - yoffset;
        } catch (IOException ex) {
            logger.warn("IOException while trying to read map.png!", ex);
        }
        logger.debug("recalculated yoffset");
        
        //mark current position on map
        String command;
        
        try {
            person = ImageIO.read(new File(PATH + "person.png"));
            //consider image dimensions
            xoffset = xoffset - person.getWidth(null) / 2;
            yoffset = yoffset - person.getHeight(null) / 2;
        } catch (IOException ex) {
            logger.warn("IOException while trying to read person.png!", ex);
        }
        logger.debug("read person from path " + PATH);
        command = "composite -geometry +" + xoffset + "+" + yoffset + " " + PATH + "person.png " + PATH + "map.png " + PATH + "map.png";

        //update pdf
        Date date = new Date();
        //PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: Found person that had an accident. Please see the map for the exact position.");
        //TODO add photo!
        
        logger.debug("updated pdf");
        
        try {
            Runtime.getRuntime().exec(command);
        } catch (IOException ex) {
            logger.warn("IOException while trying to execute composite-command!", ex);
        }
        //PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
}
