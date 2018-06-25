package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.PdfWriter;
import java.io.IOException;

/**
 * This Skill uses the 5D Camera, takes an image with it an adds this to the PDF report.
 *
 * @author kharmening
 */
public class TakePhotoWith5D extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private final String nameOfPhoto = "accident.jpg";
    private final String path = "unsupported";//PdfWriter.getReportPath();
    private final String pathWithNameOfPhoto = path + nameOfPhoto;
    private final String documentName = path + "reportTeamToBI.tex";

    private final String cameraHost = "biron@father"; // 192.168.1.43
    private final String tmpNameOfPhoto = "myFile.jpg";
    private final String takePhoto = "'gphoto2 --capture-image-and-download --filename="
            + tmpNameOfPhoto + " --force-overwrite'"; //  

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        // nothing to do here
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {

        Process proc;
        ProcessBuilder pb;

        // TAKE PHOTO
        logger.info("Try to take a photo via ssh...");
        String call1 = "ssh " + cameraHost + " " + takePhoto;
        logger.info("CALLING: " + call1);
        pb = new ProcessBuilder("ssh", cameraHost, "gphoto2", "--capture-image-and-download", "--filename="
                + tmpNameOfPhoto, "--force-overwrite");
        pb.redirectOutput(ProcessBuilder.Redirect.INHERIT);
        pb.redirectError(ProcessBuilder.Redirect.INHERIT);

        try {
            proc = pb.start();
            proc.waitFor();
        } catch (IOException | InterruptedException ex) {
            logger.error(ex.getStackTrace());
        }

        logger.info("Finished photo, now scp to the USB");
        String call2 = "scp " + cameraHost + ":~/" + tmpNameOfPhoto + " " + pathWithNameOfPhoto;
        logger.info("CALLING: " + call2);
        try {
            proc = Runtime.getRuntime().exec(call2);
            proc.waitFor();
        } catch (IOException | InterruptedException ex) {
            logger.error(ex.getStackTrace());
            return tokenError;
        }
        logger.info("Finished scp, now rm");

        String call3 = "ssh " + cameraHost + " rm " + tmpNameOfPhoto;
        logger.info("CALLING: " + call3);
        // SCP PHOTO
        try {
            proc = Runtime.getRuntime().exec(call3);
            proc.waitFor();
        } catch (IOException | InterruptedException ex) {
            logger.error(ex.getStackTrace());
        }
        logger.info("Finished rm, now adding photo in tex");

        /*
        PdfWriter.addImage(documentName, path + nameOfPhoto);
        PdfWriter.writeTextInFile(documentName, "The Picture above is showing the person in the accident.");
        logger.info("Finished photo in tex");
        PdfWriter.createPDFFile(documentName, path);*/

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }

}
