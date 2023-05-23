package de.unibi.citec.clf.bonsai.skills.arm.grasping;

import de.unibi.citec.clf.bonsai.actuators.deprecated.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.ArrayList;

/**
 *
 * @author mholland
 */
public class PositionForGrasping extends AbstractSkill {

    private static final String KEY_DISTANCE = "#_DISTANCE";
    private static final String KEY_ALL = "#_ALL";

    //defaults
    private int distance = -1;
    private boolean all = false;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenNoObject;

    private MemorySlot<ObjectShapeList> wantedObjectsSlot;
    private MemorySlot<NavigationGoalData> navSlot;
    private MemorySlot<PositionData> globalObjectPositionSlot;

    PositionData globalObjectPosition;
    ObjectShapeList wantedObjects;
    NavigationGoalData navGoal;
    private PositionData robot;

    private Sensor<PositionData> robotPositionSensor;
    private PicknPlaceActuator poseAct;

    private static final LengthUnit mm = LengthUnit.MILLIMETER;
    Point3D targetPoint;
    private CoordinateTransformer coordinateTransformer;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        poseAct = configurator.getActuator("PoseActuatorTobi", PicknPlaceActuator.class);

        navSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        wantedObjectsSlot = configurator.getSlot(
                "TargetObjectsSlot", ObjectShapeList.class);
        globalObjectPositionSlot = configurator.getSlot(
                "GlobalObjectPositionSlot", PositionData.class);

        coordinateTransformer = (CoordinateTransformer) configurator.getTransform();

        distance = configurator.requestOptionalInt(KEY_DISTANCE, distance);
        all = configurator.requestOptionalBool(KEY_ALL, all);

    }

    @Override
    public boolean init() {

        try {
            robot = robotPositionSensor.readLast(100);
        } catch (IOException | InterruptedException ex) {
            logger.error("could not read robot pos", ex);
        }

        try {
            //robot = poseAct.
            wantedObjects = wantedObjectsSlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal(ex.getMessage());
            return false;
        }

        ArrayList<Point3D> centers = new ArrayList<>();

        if (wantedObjects == null || wantedObjects.isEmpty()) {
            logger.fatal("wantedObjects null or empty");
            return false;
        }

        for (ObjectShapeData osd : wantedObjects) {
            try {
                centers.add(coordinateTransformer.transform(osd.getCenter(), "katana_base_link"));
                if (!all) {
                    targetPoint = coordinateTransformer.transform(osd.getCenter(), "katana_base_link");
                    break;
                }
            } catch (TransformException e) {
                logger.error("can not transform coordinated. " + e.getMessage());
            }
        }

        if (all) {
            double bestDist = Double.MAX_VALUE;
            for (Point3D p : centers) {
                //check if object has correct hight +-200mm from armCoordinatesystem
                if (p.getX(mm) > -200 && p.getX(mm) < 200) {
                    //check if object isnt too far away
                    if (p.getZ(mm) < bestDist) {
                        targetPoint = p;
                        bestDist = p.getZ(mm);
                    }
                }
            }
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (wantedObjects == null || wantedObjects.isEmpty()) {
            logger.debug("PositionForGrasping returned tokenNoObject");
            return tokenNoObject;
        }

        if (distance == -1 && targetPoint != null) {
            distance = (int) targetPoint.getZ(mm) - 450;
            logger.debug("driving distance:" + distance);
        }
//        
        PositionData p = new PositionData(distance, 0, 0, new Timestamp(), mm, AngleUnit.RADIAN);
        navGoal = (NavigationGoalData)p;
        navGoal.setFrameId(PositionData.ReferenceFrame.LOCAL);

        logger.debug("TRY TO DRIVE INTO TABLE: " + distance);
        logger.debug("navGoal" + navGoal.toString());

        if (targetPoint != null) { //calculate
            PositionData targetObj = new PositionData(targetPoint.getZ(mm),
                    -targetPoint.getY(mm), 0, new Timestamp(), mm, AngleUnit.RADIAN);

            logger.debug("local object pos:" + targetObj.toString());
            globalObjectPosition = CoordinateSystemConverter.localToGlobal(targetObj, robot);
            logger.debug("calculated global object");
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (navGoal != null) {
            try {
                navSlot.memorize(navGoal);
                if (globalObjectPosition != null) {
                    logger.debug("mem global object");
                    globalObjectPositionSlot.memorize(globalObjectPosition);
                }
            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }

        return curToken;
    }

}
