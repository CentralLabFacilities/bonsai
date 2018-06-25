package de.unibi.citec.clf.bonsai.skills.deprecated.objectPerception;

import de.unibi.citec.clf.bonsai.actuators.ObjectRecognitionActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.PdfWriter;
import de.unibi.citec.clf.btl.data.object.ObjectLocationList;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectData.Hypothesis;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.data.vision2d.ImageData;
import java.io.File;
import java.io.IOException;
import java.util.Date;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * In this state the robot tries to recognize Objects and writes them into the memory with
 *
 * @ObjectShapeList. If no objects were found it returns with ERROR.
 *
 *
 * @author mzeunert, lruegeme
 */
public class RecognizeObjectsOld extends AbstractSkill {

    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_2D = "#_2D";
    private static final String KEY_SAVE_IMAGE = "#_SAVE_IMAGE";

    //defaults
    private int timeout = 9000;
    boolean twoD = false;
    boolean saveImage = false;

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorNoObjects;
    private ExitToken tokenErrorNoImage;

    private Sensor<ObjectShapeList> objectSensor;
    private ObjectRecognitionActuator clafuActuator;
    private MemorySlot<ObjectShapeList> objectsRecognizedSlot;
    private MemorySlot<ObjectLocationList> objectsRecognized2dSlot;
    private MemorySlot<String> imageNameSlot;
    private Sensor<ObjectLocationList> objectSensor2D;
    private Sensor<ImageData> clafuImage;

    private ObjectShapeList foundObjects = new ObjectShapeList();
    private ObjectLocationList foundObjects2d = null;
    private Date start;
    Future<Boolean> b;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorNoObjects = configurator.requestExitToken(ExitStatus.ERROR().ps("noObjects"));
        objectSensor = configurator.getSensor("ObjectSensor3D", ObjectShapeList.class);

        twoD = configurator.requestOptionalBool(KEY_2D, twoD);
        saveImage = configurator.requestOptionalBool(KEY_SAVE_IMAGE, saveImage);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout);

        if (twoD == true) {
            objectSensor2D = configurator.getSensor("ObjectSensor2D", ObjectLocationList.class);
            objectsRecognized2dSlot = configurator.getSlot("ObjectLocationListSlot", ObjectLocationList.class);
        }

        if (saveImage == true) {
            clafuImage = configurator.getSensor(
                    "ClafuImageSensor", ImageData.class);
            tokenErrorNoImage = configurator.requestExitToken(ExitStatus.ERROR().ps("noImage"));
            imageNameSlot = configurator.getSlot("ImageNameSlot", String.class);
        }
        clafuActuator = configurator.getActuator("ClaFuActuator", ObjectRecognitionActuator.class);

        objectsRecognizedSlot = configurator.getSlot("ObjectShapeListSlot", ObjectShapeList.class);
    }

    @Override
    public boolean init() {
        try {
            objectSensor.clear();
            start = new Date();
            b = clafuActuator.recognize();

        } catch (IOException e) {
            logger.error(e.getMessage());
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if ((new Date().getTime() - start.getTime()) > timeout) {
            return tokenSuccess;
        }

        if (!b.isDone()) {
            return ExitToken.loop();
        }

        if (saveImage == true) {
            String clImage = "/tmp/obj" + System.currentTimeMillis() + ".ppm";
            String conImage = "/tmp/obj" + System.currentTimeMillis() + ".png";

            try {
                logger.debug("reading image now");
                ImageData i = clafuImage.readLast(-1);
                i.writeImage(new File(clImage));
                PdfWriter.systemExecute("convert " + clImage + " " + conImage, true);
            } catch (Exception ex) {
                logger.debug("write image failed");
                ex.printStackTrace();
                return tokenErrorNoImage;
            }

            try {
                imageNameSlot.memorize(conImage);
            } catch (CommunicationException ex) {
                Logger.getLogger(RecognizeObjectsOld.class.getName()).log(Level.SEVERE, null, ex);
                return tokenErrorNoImage;
            }
        }

        try {

            foundObjects = objectSensor.readLast(300);
            if (twoD == true) {
                foundObjects2d = objectSensor2D.readLast(300);
            }
        } catch (IOException | InterruptedException e1) {
            logger.debug("Error reading object sensor", e1);
        }

        if (twoD == true) {

            if ((foundObjects != null && foundObjects2d != null) || (new Date().getTime() - start.getTime()) > timeout) {
                return tokenSuccess;
            } else {
                return ExitToken.loop();
            }
        }

        if (foundObjects != null) {
            return tokenSuccess;
        } else {
            return ExitToken.loop();
        }

    }

    /*
     * write results to location defined in objectsRecognizedMemoryActuator.
     * 
     * @see de.unibi.citec.clf.bonsai.engine.abstractskills.AbstractSkill#end()
     */
    @Override
    public ExitToken end(ExitToken curToken) {

        if (foundObjects == null || foundObjects.isEmpty()) {
            logger.debug("No objects were found");
            return tokenErrorNoObjects;
        }
        logger.debug(foundObjects.size() + " objects found");

        for (ObjectShapeData osd : foundObjects) {
            logger.info(osd.getId() + " is " + osd.getBestLabel() + "(" + osd.getBestRel() + ") at " + osd.getCenter());
            for (Hypothesis h : osd.getHypotheses()) {
                logger.debug("\t" + h.getClassLabel() + " rel =" + h.getReliability());
            }
        }

        try {
            if (twoD == true) {
                objectsRecognized2dSlot.memorize(foundObjects2d);
            }
            objectsRecognizedSlot.memorize(foundObjects);
        } catch (CommunicationException ex) {
            logger.error("Could not write to memory slot: " + ex.getMessage());
            return ExitToken.fatal();
        }
        return tokenSuccess;

    }
}
