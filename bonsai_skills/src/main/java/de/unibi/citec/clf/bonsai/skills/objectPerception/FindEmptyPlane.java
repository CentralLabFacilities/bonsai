package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.actuators.ObjectRecognitionActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.object.ObjectLocationList;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatch;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.Date;
import java.util.concurrent.Future;
import java.util.logging.Logger;

/**
 *
 * @author llach
 */
public class FindEmptyPlane extends AbstractSkill {

    private static final String KEY_TIMEOUT = "#_TIMEOUT";

    private Sensor<ObjectShapeList> objectSensor;
    private Sensor<ObjectLocationList> objectSensor2D;
    private ObjectRecognitionActuator clafuActuator;

    private int timeout = 9000;

    private ObjectShapeList foundObjects = null;

    private MemorySlot<PlanePatch> planeSlot;
    private PlanePatch plane;
    private CoordinateTransformer coordinateTransformer;

    private Date start;
    Future<Boolean> futureB;

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNotEmpty;
    private ExitToken tokenError;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        objectSensor = configurator.getSensor("ObjectSensor3D", ObjectShapeList.class);
        clafuActuator = configurator.getActuator("ClaFuActuator", ObjectRecognitionActuator.class);

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout);

        tokenSuccessNotEmpty = configurator.requestExitToken(ExitStatus.SUCCESS().ps("notEmpty"));
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        planeSlot = configurator.getSlot("PlanePatchSlot", PlanePatch.class);

        coordinateTransformer = (CoordinateTransformer) configurator.getTransform();
    }

    @Override
    public boolean init() {
        try {
            objectSensor.clear();
            start = Time.now();
            futureB = clafuActuator.recognize();

        } catch (IOException e) {
            logger.error(e.getMessage());
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if ((Time.now().getTime() - start.getTime()) > timeout) {
            return tokenSuccess;
        }

        if (!futureB.isDone()) {
            return ExitToken.loop(50);
        }

        logger.debug("calfu is done");

        try {
            plane = planeSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("could not read plane");
        }

        try {
            foundObjects = objectSensor.readLast(300);
        } catch (IOException | InterruptedException e1) {
            logger.debug("Error reading object sensor", e1);
        }

        if (foundObjects.isEmpty() || foundObjects == null) {
            logger.debug("no objects found, assuming plane is empty");
            return tokenSuccess;
        } else {
            return compareHeights();
        }

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

    private ExitToken compareHeights() {
        Point3D planeCenter = null;
        Point3D objCenter = null;
        double minZ = 0;
        double maxZ = 0;
        double objHeight = 0;

        try {
            planeCenter = coordinateTransformer.transform(plane.getBase().getTranslation(), "base_link");
        } catch (TransformException ex) {
            logger.error("could not transform plane");
            return tokenError;
        }

        minZ = planeCenter.getZ(LengthUnit.CENTIMETER) - 5;
        maxZ = planeCenter.getZ(LengthUnit.CENTIMETER) + 5;

        logger.debug("plane base in \"base_link\": " + planeCenter);

        for (ObjectShapeData osd : foundObjects) {

            try {
                objCenter = coordinateTransformer.transform(osd.getCenter(), "base_link");
                logger.debug("object center in \"base_link\": " + objCenter);
            } catch (TransformException ex) {
                logger.error("could not transform object");
                return tokenError;
            }

            objHeight = objCenter.getZ(LengthUnit.CENTIMETER);

            if (objHeight <= maxZ && objHeight >= minZ) {
                return tokenSuccessNotEmpty;
            }
        }

        return tokenSuccess;

    }
}
