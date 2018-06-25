package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.PdfWriter;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;

public class PrepareReportManipulation extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    //TODO ersetzen durch "echte" Paths: Source robocup/share, Destination simbolic link to stick

    private static final String KEY_TASK = "#_TASK";

    /**
     * path where to put the images and the tex-file.
     */
    private String PATHDESTINATION = System.getProperty("user.home") + "/report/";
    //private static final String PATHDESTINATION = PdfWriter.getUSBPath();
    /**
     * the name of the pdf.
     */
    private String TEXNAME;
    private String datum;
    private DateFormat dateFormat;
    private String task = "manipulation";
    private String taskName = "Manipulation-Task";
    private MemorySlot<String> filenameSlot;
    private MemorySlot<String> pathSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        filenameSlot = configurator.getSlot("filenameSlot", String.class);
        pathSlot = configurator.getSlot("pathSlot", String.class);

        task = configurator.requestOptionalValue(KEY_TASK, task);

    }

    @Override
    public boolean init() {
        dateFormat = new SimpleDateFormat("dd.MM.yyyy_kk.mm"); // Format für 24-Stunden-Anzeige
        datum = dateFormat.format(new Date());

        //PATHDESTINATION = PdfWriter.getReportPath();
        if (PATHDESTINATION == null) {
            logger.debug("PDFWriter returned null as path. Trying to fix it ...");
            PATHDESTINATION = System.getProperty("user.home") + "/";
        }
        if (PATHDESTINATION == System.getProperty("user.home") + "/report/") {
            logger.error("USB could not be set, using " + PATHDESTINATION + " Instead!!!");
        } else {
            logger.debug("USBPath is: " + PATHDESTINATION);
        }
        switch (task) {
            case "personRecognition":
                TEXNAME = "Team_Tobi_PersonRecReport_";
                break;
            case "manipulation":
                TEXNAME = "Team_Tobi_ManipulationReport_";
                break;
        }
        TEXNAME = TEXNAME + datum + ".tex";
        logger.debug("Texname is: " + TEXNAME);

        try {
            pathSlot.memorize(PATHDESTINATION);
            filenameSlot.memorize(TEXNAME);
        } catch (CommunicationException ex) {
            logger.error("exception", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        DateFormat dateFormat2 = new SimpleDateFormat("dd.MM.yyyy  kk:mm"); // Format für 24-Stunden-Anzeige
        String datum2 = dateFormat2.format(new Date());
        String filenameTex = PATHDESTINATION + TEXNAME;
        String taskDescription
                = "This report describes the task Manipulation and Object Recognition of the "
                + "RoboCup@Home event. \\\\"
                + "This task was done at " + datum2 + ".\\\\"
                + "The report contains all recognized objects.\\\\"
                + "Also a picture of the objects in its current situation can be found here.\\\\"
                + "Furthermore you can find information about what exactly has been recognized.";
        switch (task) {
            case "personRecognition": {
                taskName = "PersonRecognition-Task";
                taskDescription
                        = "This report describes the task Person Recognition of the RoboCup@Home event. \\\\"
                        + "This task was done at " + datum2 + ".\\\\"
                        + "The report contains a picture of the recognized and labeled operator.\\\\"
                        + "Also a picture of the crowd and the operator is given.\\\\"
                        + "Furthermore you can find information the gender of each person and the operators pose.";
                break;
            }
        }
        /*
        PdfWriter.createTexFile(filenameTex, taskName);
        logger.debug("DEBUG: TEXFILE ERSTELLT================================");
        PdfWriter.writeTitleInFile(filenameTex, "Report: " + taskName);
        PdfWriter.writeTextInFile(filenameTex, taskDescription);
        PdfWriter.writeTextInFile(filenameTex, "\\vspace{1cm}========================================================\\vspace{1cm}");
        //PdfWriter.createPDFFile(filenameTex, PATHDESTINATION);*/
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
}
