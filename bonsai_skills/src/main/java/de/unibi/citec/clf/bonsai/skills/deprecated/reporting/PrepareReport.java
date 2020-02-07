package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;



import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.util.Date;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Marks the actual position to the image of the map. TYPE: decides which symbol
 * to use: fire or person
 *
 * @author adreyer, kharmening
 */
public class PrepareReport extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    //TODO ersetzen durch "echte" Paths: Source robocup/share, Destination simbolic link to stick

    /**
     * path where to find the images for fire and persons.
     */
    private static final String PATHSOURCE2 = "/home/biron/Desktop/";
    /**
     * path where to put the images and the tex-file.
     */
    private static final String PATHDESTINATION = "unsupported";//PdfWriter.getReportPath();
    /**
     * path where to find the map.
     */
    //private static final String PATHMAP = "/vol/robocup/2013/share/ros/workspace/src/robocup-ros/tobi_2dnav/maps/";
    private static final String PATHMAP = "/vol/robocup/2014/ros/share/tobi_2dnav/maps/";

    /**
     * the name of the pdf.
     */
    private static final String PDFNAME = "reportTeamToBI.tex";
    private static final String MAP = "brazil_200714_1035";//zentrallab_060614 "wm2013" "magdeburg_final";//"centralLab14_03_14";//"wm2013";
    /**
     * logger.
     */
    private static final org.apache.log4j.Logger LOGGER = org.apache.log4j.Logger.getLogger(WritePositionToMap.class);
    /**
     * URLs to Images.
     */
//    private URL personPos = Class.class.getResource("/images/person.png");
    private String personPos = "/vol/robocup/2014/share/images/person.png";
    private String accidentPos = "/vol/robocup/2014/share/images/accident.jpg";
    
    
    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        logger.debug("USBPath is: " + PATHDESTINATION);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        //copy images and convert map from pgm to png
        logger.debug("DEBUG: WILL FILES KOPIEREN=============================");
        File in = new File(personPos);//personPos.getPath());
        File out = new File(PATHDESTINATION + "person.png");
        FileChannel inChannel;
        FileChannel outChannel;
        try {
            inChannel = new FileInputStream(in).getChannel();
            outChannel = new FileOutputStream(out).getChannel();
            inChannel.transferTo(0, inChannel.size(), outChannel);
            inChannel.close();
            outChannel.close();
        } catch (FileNotFoundException ex) {
            logger.error("FnF Exception while copying person.png");
        } catch (IOException e) {
            logger.error("IO Exception while copying person.png");
        }
        logger.debug("DEBUG: PERSON KOPIERT==================================");
        in = new File(accidentPos);
        out = new File(PATHDESTINATION + "accident.jpg");
        try {
            inChannel = new FileInputStream(in).getChannel();
            outChannel = new FileOutputStream(out).getChannel();
            inChannel.transferTo(0, inChannel.size(), outChannel);
            inChannel.close();
            outChannel.close();
        } catch (FileNotFoundException ex) {
            logger.error("FnF Exception while copying person.png");
        } catch (IOException e) {
            logger.error("IO Exception while copying person.png");
        }
        logger.debug("DEBUG: ACCIDENT KOPIERT==================================");
        in = new File(PATHMAP + MAP + ".pgm");
        out = new File(PATHDESTINATION + "map.pgm");
        try {
            inChannel = new FileInputStream(in).getChannel();
            outChannel = new FileOutputStream(out).getChannel();
            inChannel.transferTo(0, inChannel.size(), outChannel);
            inChannel.close();
            outChannel.close();
        } catch (IOException e) {
        }
        logger.debug("DEBUG: MAP " + PATHMAP + MAP + " KOPIERT=====================================");
        String command = "convert " + PATHDESTINATION + "map.pgm " + PATHDESTINATION + "map.png";
        try {
            Runtime.getRuntime().exec(command);
        } catch (IOException ex) {
            LOGGER.warn("IOException while trying to execute convert-command(convert map to png)!", ex);
        }
        try {
            Thread.sleep(500);
        } catch (InterruptedException ex) {
            Logger.getLogger(PrepareReport.class.getName()).log(Level.SEVERE, null, ex);
        }
        logger.debug("DEBUG: MAP KONVERTIERT=================================");

        //prepare tex-file
        String filename = PATHDESTINATION + PDFNAME;
        Date date = new Date();
        /*PdfWriter.createTexFile(filename, "Emergency-Report");
        logger.debug("DEBUG: TEXFILE ERSTELLT================================");
        PdfWriter.writeTextInFile(filename,
                "This report describes the task \"Emergency Situation\" of the "
                + "RoboCup@Home event from Jul 19 till Jul 24 in Joao Pessoa, Brazil.\n"
                + "This task is done at " + date.toString() + ".\n"
                + "The report contains a map of the apartment with the position of the person "
                + "who had an accident.\n"
                + "Also a picture of the person in its current situation can be found here. "
                + "Furthermore you can find some informations about what exactly has happened.");
        PdfWriter.addHeadline(filename, "Map of the Apartment");
        PdfWriter.addImage(filename, PATHDESTINATION + "map.png", 0.5);
        PdfWriter.writeTextInFile(filename, "");
        PdfWriter.addImage(filename, PATHDESTINATION + "person.png", 1.0);
        PdfWriter.writeTextInFile(filename, "Person who had an accident"); 
        PdfWriter.createPDFFile(filename, PATHDESTINATION);*/
        logger.debug("DEBUG: PDF ERSTELLT====================================");
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
}
