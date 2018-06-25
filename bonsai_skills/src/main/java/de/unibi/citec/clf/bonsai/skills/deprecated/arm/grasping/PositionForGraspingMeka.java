package de.unibi.citec.clf.bonsai.skills.deprecated.arm.grasping;

import de.unibi.citec.clf.bonsai.actuators.JointControllerActuator;
import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.MapReader;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * TODO: test offsets; also x offset?
 *
 * @author llach
 */
public class PositionForGraspingMeka extends AbstractSkill {

    private static final String KEY_MOVE_SPEED = "#_MOVE_SPEED";
    private static final String KEY_Z_OFFSET = "#_Z_OFFSET";
    private static final String KEY_Y_OFFSET = "#_Y_OFFSET";

    private MemorySlot<ObjectShapeList> objectsRecognizedSlot;
    private Sensor<PositionData> robotPositionSensor;

    private NavigationActuator navActuator;
    private JointControllerActuator jointcontroller;

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private PositionData robotPos = null;

    private ObjectShapeList objects = null;

    private Point3D center3d = null;
    private double moveSpeed = 0.3;
    private double zliftOffset = 0.73;
    private double yOffset = 0.3;
    private double zliftPos = 0.0;
    private double yPos = 0.0;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        //jointcontroller = configurator.getActuator("MekaJointActuator", JointControllerActuator.class);
        //navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);
        objectsRecognizedSlot = configurator.getSlot(
                "objectsRecognizedSlot", ObjectShapeList.class);

        moveSpeed = configurator.requestOptionalDouble(KEY_MOVE_SPEED, moveSpeed);
        zliftOffset = configurator.requestOptionalDouble(KEY_Z_OFFSET, zliftOffset);
        yOffset = configurator.requestOptionalDouble(KEY_Y_OFFSET, yOffset);

    }

    @Override
    public boolean init() {
        try {
            objects = objectsRecognizedSlot.recall();
        } catch (CommunicationException ex) {

            Logger.getLogger(PositionForGraspingMeka.class.getName()).log(Level.SEVERE, null, ex);
            logger.debug("unable to recall objects");
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        double dist = 100000;

        for (ObjectShapeData obj : objects) {
            Point3D center = obj.getCenter();

            double distToOrigin = Math.sqrt((Math.pow(center.getX(LengthUnit.METER), 2) + Math.pow(center.getY(LengthUnit.MILLIMETER), 2)));
            logger.debug("old dist: " + dist + " comparing with: " + distToOrigin);

            if (distToOrigin < dist) {
                logger.debug("dist updated");
                dist = distToOrigin;
                center3d = center;
            } else {
                logger.debug("object too far");
            }
        }

        if (center3d == null) {
            logger.debug("center was null");
            return tokenError;
        }

        zliftPos = center3d.getZ(LengthUnit.METER) - zliftOffset;

        if (zliftPos <= 0) {
            logger.debug("object too low, driving to lowest position");
            zliftPos = 0.0;
        }

        /* 
        try {
            jointcontroller.goToZliftHeight((float) zliftPos);
        } catch (IOException ex) {
            Logger.getLogger(PositionForGraspingMeka.class.getName()).log(Level.SEVERE, null, ex);
        }*/
        yPos = center3d.getY(LengthUnit.METER) - yOffset;

        /*                              x  y
             Point2D direction = new Point2D(0, 1, LengthUnit.METER);
             DriveData driveData = new DriveData(dist, LengthUnit.METER, moveSpeed, SpeedUnit.METER_PER_SEC, direction);
        
            navActuator.moveRelative(driveData, null);*/
        logger.debug("New y: " + yPos + " ### zPos: " + zliftPos);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
