package de.unibi.citec.clf.bonsai.skills.deprecated.arm;

import de.unibi.citec.clf.bonsai.actuators.deprecated.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.arm.ArmController180;
import de.unibi.citec.clf.btl.data.grasp.GraspReturnType;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatch;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 *
 * TODO: untobify
 * @author kgardeja
 */
public class PlaceObjectOnPlane extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorPosUnreachable;

    private ArmController180 armController;
    private PicknPlaceActuator poseAct;
    private MemorySlot<PlanePatch> tableSlot;

    private static final LengthUnit DEFAULT_LENGTH_UNIT = LengthUnit.MILLIMETER;

  //  private CoordinateTransformer coordinateTransformer;
    
    private Future<GraspReturnType> returnFuture;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorPosUnreachable = configurator.requestExitToken(ExitStatus.ERROR().ps("unknown"));
        poseAct = configurator.getActuator("PoseActuatorTobi", PicknPlaceActuator.class);
        tableSlot = configurator.getSlot("PlanePatchSlot", PlanePatch.class);

      //  coordinateTransformer = configurator.getCoordinateTransformer();
    }

    @Override
    public boolean init() {
        armController = new ArmController180(poseAct);
        
        PlanePatch planeObj = null;

        try {
            planeObj = tableSlot.recall();
        } catch (CommunicationException ex) {
            logger.info(ex.getMessage());
        }

        if (planeObj == null) {
            logger.error("No plane and no position given for placing item!!!!");
            return false;
        }
        
        logger.debug("INFO: plane height: "+planeObj.getBase().getTranslation().getZ(DEFAULT_LENGTH_UNIT));        
        logger.debug("INFO: for now place hardcoded on 'surface0'");
       // returnFuture = armController.placeObjectOnSurface((float)planeObj.getBase().getTranslation().getZ(DEFAULT_LENGTH_UNIT));        
        returnFuture = armController.placeObjectOnSurface("surface0");
        
       /* ObjectShapeData place;
        try {
            place = calcBoundingBox(planeObj);
            returnFuture = armController.placeObjectInRegion(place);
        } catch (TransformException e) {
            logger.error(e.getMessage(), e);
            return false;
        }
        */
        return true;
    }

    @Override
    public ExitToken execute() {

    	if (!returnFuture.isDone()) {
            logger.debug("placing is not done yet");
            return ExitToken.loop(500);
        }
        try {
        	GraspReturnType ret = returnFuture.get();
	        logger.debug("ArmController GRT returned: " + ret.getGraspResult());
	
            if (ret.getGraspResult() == GraspReturnType.GraspResult.SUCCESS) {
                return tokenSuccess;
            } else if (ret.getGraspResult() == GraspReturnType.GraspResult.ROBOT_CRASHED) {
                logger.error("The arm crashed unrecoverable. Que pena...");
                return ExitToken.fatal();
            } else {
                if (ret.getGraspResult() == GraspReturnType.GraspResult.POSITION_UNREACHABLE) {
                    return tokenErrorPosUnreachable;
                }
                return ExitToken.fatal();
            }
        } catch (ExecutionException | InterruptedException e) {
            logger.debug(e.getMessage(), e);
            logger.error(e.getMessage());
            return ExitToken.fatal();
        }

    }
/*
    public ObjectShapeData calcBoundingBox(PlanePatch plane) throws TransformException {

        String frame = "katana_base_link";

        Pose3D transPlaneBase = coordinateTransformer.transform(plane.getBase(), frame);
        PlanePatch transPlane = new PlanePatch(plane);
        transPlane.setBase(transPlaneBase);
        transPlane.setFrameId(frame);

        double minX = Double.MAX_VALUE;
        double maxX = Double.MIN_VALUE;
        double minY = Double.MAX_VALUE;
        double maxY = Double.MIN_VALUE;
        double minZ = Double.MAX_VALUE;
        double maxZ = Double.MIN_VALUE;

        PointCloud cloud = transPlane.calculatePointCloud3D();
        for (Point3D p : cloud.getPoints()) {
            double x = p.getX(DEFAULT_LENGTH_UNIT);
            double y = p.getY(DEFAULT_LENGTH_UNIT);
            double z = p.getZ(DEFAULT_LENGTH_UNIT);
            if (minX > x) {
                minX = x;
            }
            if (maxX < x) {
                maxX = x;
            }
            if (minY > y) {
                minY = y;
            }
            if (maxY < y) {
                maxY = y;
            }
            if (minZ > z) {
                minZ = z;
            }
            if (maxZ < z) {
                maxZ = z;
            }
        }
        logger.info("Plane found at X:" + transPlane.getBase().getTranslation().getX(DEFAULT_LENGTH_UNIT) + " Y: "
                + transPlane.getBase().getTranslation().getY(DEFAULT_LENGTH_UNIT) + " Z: "
                + transPlane.getBase().getTranslation().getZ(DEFAULT_LENGTH_UNIT) + " frame: " + frame);

        // THIS IS ONLY TRUE FOR FRAME katana_base_link
        double w = maxY - minY;
        double h = maxX - minX;
        double d = maxZ - minZ;

        Point3D center = transPlane.calculateCenterPoint();

        logger.info("Center at:" + center);

        center = transPlane.getBase().getTranslation();

        logger.info("Center2 at:" + center);

        ObjectShapeData shape = new ObjectShapeData();
        shape.setCenter(new Point3D(center.getX(DEFAULT_LENGTH_UNIT), center.getY(DEFAULT_LENGTH_UNIT),
                center.getZ(DEFAULT_LENGTH_UNIT), DEFAULT_LENGTH_UNIT, frame));
        shape.setWidth(w, DEFAULT_LENGTH_UNIT);
        shape.setHeight(h, DEFAULT_LENGTH_UNIT);
        shape.setDepth(d, DEFAULT_LENGTH_UNIT);

        logger.info("trying to grasp in bounding box: center: " + shape.getCenter() + " w:"
                + shape.getWidth(DEFAULT_LENGTH_UNIT) + " h:" + shape.getHeight(DEFAULT_LENGTH_UNIT) + " d:"
                + shape.getDepth(DEFAULT_LENGTH_UNIT));

        return shape;
    }
*/
    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }

}
