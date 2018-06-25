package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;



import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.PdfWriter;

/**
 * Marks the actual position to the image of the map. TYPE: decides which symbol
 * to use: fire or person
 *
 * @author adreyer
 */
public class PrepareReportDemoChallenge extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    //TODO ersetzen durch "echte" Paths: Source robocup/share, Destination simbolic link to stick

    /**
     * path where to find the images for fire and persons.
     */
    private static final String PATHSOURCE = "/home/biron/Desktop/";
    /**
     * path where to put the images and the tex-file.
     */
    private static final String PATHDESTINATION = "unsupported";//PdfWriter.getReportPath();
    /**
     * the name of the pdf.
     */
    private static final String PDFNAME = "reportDemoChallenge.tex";

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
        //prepare tex-file
        String filename = PATHDESTINATION + PDFNAME;
        /*
        PdfWriter.createTexFileCourier(filename);
        PdfWriter.writeTextInFileWithoutNewline(filename, "====================================================================================\n"
                + "St. Josefs Krankenhaus Warendorf~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~Page 1\\\\\n"
                + "Ward 13\\\\\n"
                + "=======================================================================================\n"
                + "Patient: XY321ABC~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~Report from 27.4.2013\\\\\n"
                + "Name: Max Mustermann\\\\\n"
                + "Date of birth: 1.1.2000\\\\\n"
                + "Size: 1.80 m\\\\\n"
                + "Weight: 79 kg\\\\\n"
                + "=======================================================================================\\\\\\\\\n");
        PdfWriter.createPDFFile(filename, PATHDESTINATION);*/
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
}
