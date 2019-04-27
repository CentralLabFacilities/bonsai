package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import javax.vecmath.Matrix3d;
import javax.vecmath.Matrix4d;
import javax.vecmath.Vector3d;
import javax.vecmath.Vector4d;
import java.io.IOException;


/**
 * Calculates a good point to drive to for grasping a given object.
 * <pre>
 *
 * Options:
 *  #_DISTANCE:   [double] Optional (default: "0.25")
 *                                  -> The distance the robot will keep from the object
 *
 * Slots:
 *  ObjectShapeDataListSlot: [ObjectShapeList] [Write]
 *      -> Memory slot with exactly one ObjectShapeData, which will be the target of this skill
 *  NavigationGoalDataSlot: [NavigationGoalData] [Write]
 *      -> Memory slot to store the target
 *
 * ExitTokens:
 *  success:                Target set successfully
 *  error:                  Something went wrong
 *
 * Sensors:
 *
 * Actuators:
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */

public class SetTargetByObjectShapeData extends AbstractSkill {

    private static final String KEY_DISTANCE = "#_DISTANCE";

    private ExitToken tokenSuccess;

    private MemorySlotReader<ObjectShapeData> objectShapeDataSlot;
    private MemorySlotWriter<NavigationGoalData> navigationGoalDataSlot;

    private Sensor<PositionData> posSensor;

    private ObjectShapeData objectShapeData;
    private NavigationGoalData navigationGoalData;
    private double distance = 0.25;

    private LengthUnit LU = LengthUnit.METER;
    private AngleUnit AU = AngleUnit.RADIAN;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        distance = configurator.requestOptionalDouble(KEY_DISTANCE, distance);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        objectShapeDataSlot = configurator.getReadSlot("ObjectShapeDataSlot", ObjectShapeData.class);
        navigationGoalDataSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        posSensor = configurator.getSensor("PositionSensor", PositionData.class);

    }

    @Override
    public boolean init() {

        try {
            objectShapeData = objectShapeDataSlot.recall();
        } catch (CommunicationException e) {
            logger.error(e.getMessage());
            return false;
        }
        if (objectShapeData == null) {
            logger.error("The ObjectShapeDataSlot was not set.");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        Point2D navposi = calculateCorrectPosition();

        PositionData pos = new PositionData(objectShapeData.getBoundingBox().getPose().getTranslation().getX(LU), objectShapeData.getBoundingBox().getPose().getTranslation().getY(LU), 0.0, LU, AU);

        navigationGoalData = new NavigationGoalData(new PositionData(navposi.getX(LU), navposi.getY(LU), 0.0, LU, AU));
        navigationGoalData.setYaw((new Point2D(navigationGoalData.getX(LU), navigationGoalData.getY(LU))).getAngle(pos), AU);

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (navigationGoalData != null) {
                try {
                    navigationGoalDataSlot.memorize(navigationGoalData);
                } catch (CommunicationException ex) {
                    logger.fatal("Unable to write to memory: " + ex.getMessage());
                    return ExitToken.fatal();
                }
            }
        }
        return curToken;
    }

    private Point2D calculateCorrectPosition() {
        Matrix3d mat = objectShapeData.getBoundingBox().getPose().getRotation().getMatrix();
        Point3D transVec = objectShapeData.getBoundingBox().getPose().getTranslation();

        Matrix4d objFrameToMapFrame = new Matrix4d(mat, new Vector3d(transVec.getX(LU), transVec.getY(LU), transVec.getZ(LU)), 1.0);

        Vector4d navGoalInObjFrame = new Vector4d(0.0, 0.0, 0.0, 1.0);

        objFrameToMapFrame.transform(navGoalInObjFrame);

        logger.debug("center of object in map coordinates (hopefully): " + navGoalInObjFrame.toString());

        double x = 0.0;
        double y = 0.0;
        double z = 0.0;

        if (objectShapeData.getBoundingBox().getSize().getX(LU) > objectShapeData.getBoundingBox().getSize().getY(LU)) {
            if (objectShapeData.getBoundingBox().getSize().getX(LU) > objectShapeData.getBoundingBox().getSize().getZ(LU)) {
                // x biggest
                if (objectShapeData.getBoundingBox().getSize().getY(LU) > objectShapeData.getBoundingBox().getSize().getZ(LU) ){
                    //then y, then z
                    z = distance;
                }else{
                    // then z, then y
                    y = distance;
                }
            } else {
                // z biggest, then x, then y
                y = distance;
            }
        } else if (objectShapeData.getBoundingBox().getSize().getY(LU) > objectShapeData.getBoundingBox().getSize().getZ(LU)) {
            // y biggest
            if (objectShapeData.getBoundingBox().getSize().getX(LU) > objectShapeData.getBoundingBox().getSize().getZ(LU)){
                // then x, then z
                z = distance;
            }else{
                // then z, then x
                x = distance;
            }
        } else {
            // z > y > x
            x = distance;
        }

        navGoalInObjFrame = new Vector4d(x, y, z, 1.0);
        objFrameToMapFrame.transform(navGoalInObjFrame);
        Point2D point1 = new Point2D(navGoalInObjFrame.x, navGoalInObjFrame.y, LU);

        Vector4d navGoalInObjFrame2 = new Vector4d(-x, -y, -z, 1.0);
        objFrameToMapFrame.transform(navGoalInObjFrame2);
        Point2D point2 = new Point2D(navGoalInObjFrame2.x, navGoalInObjFrame2.y, LU);

        PositionData roboPos = getRobotPosition();

        Point2D point;
        if(roboPos.getDistance(point1, LU) < roboPos.getDistance(point2, LU)){
            point = point1;
        }else{
            point = point2;
        }

        logger.debug("distance \"" + distance + "\" in the direction of the smallest dimension (hopefully): " + point.toString());

        return point;
    }


    private PositionData getRobotPosition() {

        PositionData robot = null;
        try {
            robot = posSensor.readLast(-1);
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read robot position", ex);
        }
        return robot;
    }
}
