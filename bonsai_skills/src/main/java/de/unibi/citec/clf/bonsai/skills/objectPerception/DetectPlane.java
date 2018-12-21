package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.actuators.ObjectRecognitionActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.MapReader;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatch;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatchList;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.Date;
import java.util.Map;
import java.util.concurrent.Future;

/**
 *
 * @author lruegeme
 */
public class DetectPlane extends AbstractSkill {

    //Keys
    private static final String KEY_SANE = "#_SANE_ONLY";
    private static final String KEY_TABLE_MIN_SIZE = "#_MIN_SIZE";
    private static final String KEY_TABLE_MIN_HEIGHT = "#_MIN_HEIGHT";

    //default values
    private boolean checkSanity = false;
    private double minSize = 20000;
    private double minHeight = 100;

    private static final LengthUnit DEFAULT_LENGTH_UNIT = LengthUnit.MILLIMETER;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenErrorNoTable;

    private MemorySlot<PlanePatch> tableSlot;
    private Sensor<PlanePatchList> planeObjSensor;
    private ObjectRecognitionActuator startStopActuator;

    //private CoordinateTransformer transf;
    private PlanePatchList list = null;
    private Date start;
    private PlanePatch largestPlane = null;

    Future<Boolean> b;
    /**
     * Time for object recognition in ms
     */
    private static final int TIME_TO_RECOGNIZE = 3000;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorNoTable = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("noTable"));

        //TODO take transformer back in, caused crashes on meka
        //transf = configurator.getCoordinateTransformer();
        planeObjSensor = configurator.getSensor("PlanePatchSensor", PlanePatchList.class);
        startStopActuator = configurator.getActuator("ClaFuActuator", ObjectRecognitionActuator.class);
        tableSlot = configurator.getSlot("PlanePatchSlot", PlanePatch.class);

        checkSanity = configurator.requestOptionalBool(KEY_SANE, checkSanity);
        minSize = configurator.requestOptionalDouble(KEY_TABLE_MIN_SIZE, minSize);
        minHeight = configurator.requestOptionalDouble(KEY_TABLE_MIN_HEIGHT, minHeight);

    }

    @Override
    public boolean init() {

        try {
            start = Time.now();
            b = startStopActuator.recognize();
        } catch (IOException e) {
            logger.error(e.getMessage());
            return false;
        }
        return true;
    }

    private ExitToken saneTable() {
        logger.debug("started sane table");

        Pose3D planeBase = null;
        double largestArea = 0;
        for (PlanePatch plane : list) {

            if (!sane(plane)) {
                continue;
            }

            double area = plane.getBorder().getArea(DEFAULT_LENGTH_UNIT);
            if (largestArea < area) {
                largestArea = area;
                largestPlane = plane;
            }
        }

        if (largestPlane == null) {
            return tokenErrorNoTable;
        }

        planeBase = largestPlane.getBase();
        logger.info("Plane found at X:" + planeBase.getTranslation().getX(DEFAULT_LENGTH_UNIT)
                + "  Y: " + planeBase.getTranslation().getY(DEFAULT_LENGTH_UNIT) + "  Z: "
                + planeBase.getTranslation().getZ(DEFAULT_LENGTH_UNIT) + "  frame: " + planeBase.getTranslation().getFrameId());
        return tokenSuccess;
    }

    private void largestTable() {
        // find largest in list

        double largestArea = 0;
        for (PlanePatch plane : list) {
            double area = plane.getBorder().getArea(DEFAULT_LENGTH_UNIT);
            if (largestArea < area) {
                largestArea = area;
                largestPlane = plane;
            }
        }

        Pose3D planeBase = largestPlane.getBase();

        logger.info("Plane found at X:" + planeBase.getTranslation().getX(DEFAULT_LENGTH_UNIT)
                + "  Y: " + planeBase.getTranslation().getY(DEFAULT_LENGTH_UNIT) + "  Z: "
                + planeBase.getTranslation().getZ(DEFAULT_LENGTH_UNIT) + "  frame: " + planeBase.getTranslation().getFrameId());

    }

    @Override
    public ExitToken execute() {

        if (!b.isDone()) {
            //Date now = new Date();
            /*if(now.getTime() - start.getTime() > 10000)
            {
                logger.fatal("Clafu takes longer than 10sec.");
                return ExitToken.fatal();
            }*/
            return ExitToken.loop(50);
        }

        try {
            list = planeObjSensor.readLast(200);

            if (list == null || list.isEmpty()) {
                if (Time.now().getTime() - start.getTime() < TIME_TO_RECOGNIZE) {
                    return ExitToken.loop(50);
                } else {
                    return tokenErrorNoTable;
                }
            }
        } catch (IOException | InterruptedException e) {
            logger.error(e.getMessage());
            logger.debug(e.getMessage(), e);
            return ExitToken.fatal();
        }

        if (!checkSanity) {
            largestTable();
        } else {
            ExitToken t = saneTable();
            if (!t.getExitStatus().isSuccess()) {
                return t;
            }
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        try {
            if (largestPlane != null) {
                tableSlot.memorize(largestPlane);
                return tokenSuccess;
            } else {
                return tokenErrorNoTable;
            }

        } catch (CommunicationException ex) {
            logger.error("Could not memorize the plane");
            return ExitToken.fatal();
        }

    }

    private boolean sane(Pose3D planeBase) {
        logger.info("Checking Plane at X:" + planeBase.getTranslation().getX(DEFAULT_LENGTH_UNIT)
                + "  Y: " + planeBase.getTranslation().getY(DEFAULT_LENGTH_UNIT) + "  Z: "
                + planeBase.getTranslation().getZ(DEFAULT_LENGTH_UNIT) + "  frame: " + planeBase.getTranslation().getFrameId());

        return true;
    }

    private boolean sane(PlanePatch plane) {

        Pose3D pose = plane.getBase();
        /*
        try {
            pose = transf.transform(pose, "base_link");
        } catch (CoordinateTransformer.TransformException ex) {
            logger.info("could not transform coordinates");
            return false;
        }*/

        logger.info("Plane checking on sanity\n at X:" + pose.getTranslation().getX(DEFAULT_LENGTH_UNIT)
                + "  Y: " + pose.getTranslation().getY(DEFAULT_LENGTH_UNIT) + "  Z: "
                + pose.getTranslation().getZ(DEFAULT_LENGTH_UNIT) + "  frame: " + pose.getTranslation().getFrameId());

        logger.info("area: " + plane.getBorder().getArea(DEFAULT_LENGTH_UNIT));

        if (pose.getTranslation().getZ(DEFAULT_LENGTH_UNIT) < minHeight) {
            logger.info("plane: " + plane + " to low\n "
                    + pose.getTranslation().getZ(DEFAULT_LENGTH_UNIT) + "<" + minHeight);
            return false;
        }

        if (plane.getBorder().getArea(DEFAULT_LENGTH_UNIT) < minSize) {
            logger.info("plane: " + plane + " to small\n "
                    + plane.getBorder().getArea(DEFAULT_LENGTH_UNIT) + "<" + minSize);
            return false;
        }

        largestPlane = plane;

        return true;

    }
}
