package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.PdfWriter;
import java.util.Date;
import java.util.Map;

/**
 * Adds a new line to the report. TYPE: decides which text to use: fire or
 * person
 *
 * @author adreyer, kharmening
 */
public class UpdateReport extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    
    private static final String TYPE = "#_TYPE";
    
    //TODO ersetzen durch "echte" Paths: simbolic link to stick
    /**
     * path where to find the images and the tex-file.
     */
    private static final String PATH = "unsupported";//PdfWriter.getReportPath();
    /**
     * the name of the pdf.
     */
    private static final String PDFNAME = "reportTeamToBI.tex";
    /**
     * logger.
     */
    private static final org.apache.log4j.Logger LOGGER = org.apache.log4j.Logger.getLogger(WritePositionToMap.class);
    private String type = "person";

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        logger.debug("USBPath is: " + PATH);
        
        type = configurator.requestOptionalValue(TYPE, type);
    }

    @Override
    public boolean init() {

        return true;
    }

    @Override
    public ExitToken execute() {
        Date date = new Date();
        if (null != type) switch (type) {
            /*
            case "enterArena":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: Entered the apartment.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "accident":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: Recognized accident by seeing a waving hand.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "ambulance":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I called the ambulance.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "friend":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I called a friend.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "noHelp":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: The person does not need any help of other persons.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "firstAidOrderd":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I was asked to bring biscuits.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "firstAidFetched":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I grasped the biscuits.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "firstAidBrought":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: Successfully delivered the biscuits to the person.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "waterOrdered":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I was asked to bring some water.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "waterFetched":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I grasped the water.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "waterBrought":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: Successfully delivered the water to the person.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "cellPhoneOrdered":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I was asked to bring the energy drink.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "cellPhoneFetched":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I grasped the energy drink.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "cellPhoneBrought":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: Successfully delivered the energy drink to the person.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "nothingToFetch":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: The Person does not need anything.");// or the cell phone.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "backWithNothing":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I could not find any object so I could not grasp.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "arrivedExitAmbulance":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: Start waiting for the Doctor at the apartment door.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "arrivedExitFriend":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: Start waiting for the friend at the apartment door.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "arrivedExitNoHelp":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: Reached the apartment door. End now.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "ambluanceThere":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: The ambulance has arrived.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "friendThere":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: The friend has arrived.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "escortDoc":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I bring the Doctor to the accident.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;
            case "escortFriend":
                PdfWriter.writeTextInFile(PATH + PDFNAME, "[" + date.toString() + "]: I bring the called friend to the accident.");
                PdfWriter.createPDFFile(PATH + PDFNAME, PATH);
                break;*/
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
}
