package de.unibi.citec.clf.bonsai.util.arm;


import de.unibi.citec.clf.bonsai.actuators.GraspActuator;
import de.unibi.citec.clf.bonsai.actuators.PicknPlaceActuator;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.grasp.GraspReturnType;
import de.unibi.citec.clf.btl.data.grasp.GraspReturnType.GraspResult;
import de.unibi.citec.clf.btl.data.grasp.KatanaGripperData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.LinkedList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.apache.log4j.Logger;

/**
 * ArmControl.java Moves the arm to a desired location observed in the image by
 * transforming the point using a transformation matrix.
 *
 * @author dwigand, semeyerz, nrasic
 */
public class ArmController180 {

    private static final Logger logger = Logger.getLogger(ArmController180.class);
    private static final double OFFSET_TO_ROBOT_BASE_METER = 0.230; // m //form robotcenter to the first armjoint
    private final PicknPlaceActuator poseActuator;
    /*
     used in waitformovement since many commands at once can not be handled 
     by the armserver
     */
    private final int WAITAFTERCOMMAND = 2000;
    /*
     effecitve width of items we can grasp feel free to test it 
     */
    private final double armEffector_WIDTH_meter = 1.100;

    private static String lastKnownPose = null;

    /**
     * Creates a new ArmControl.
     *
     * @param poseA the poseActuator
     */
    public ArmController180(PicknPlaceActuator poseA) {

        this.poseActuator = poseA;
    }

    /**
     * closes the gripper till an forcethreshold
     *
     * @return true if an object was in the gripper.
     */
    public boolean closeGripperByForce() {
        try {
            this.poseActuator.closeGripperByForce();
            return isSomethingInGripper();
        } catch (IOException e) {
            logger.error("Error while closing by force-detection");
            return false;
        }
    }

    /**
     * Test if something is in gripper. This method only evaluates the
     * poseActuator.siSomethingInGripper
     *
     * @return true or false depending on the sensors in
     * armServer.isSomethingInGripper
     */
    public boolean isSomethingInGripper() {
        try {
            if (this.poseActuator.isSomethingInGripper().get()) {
                logger.debug("ArmServer thinks we have something in gripper");
                return true;
            } else {
                logger.debug("ArmServer thinks we don't have an object in the gripper.");
                return false;
            }
        } catch (IOException | InterruptedException | ExecutionException e) {
            logger.error("Could not read isSomethingInGripper");
            return false;
        }
    }

    /**
     * prints all infrared sensor data into the logger as debug.
     * skillsLogging.properties must be set properly in
     * robocupathome/src/main/resources
     */
    public void logDebugOutSensor() {
        try {
            KatanaGripperData gripperSensors = poseActuator.getGipperSensorData().get();
            //Infrared
            logger.debug("Infrared Middle sensor: " + gripperSensors.getInfraredMiddle());

            logger.debug("LeftFront sensor: " + gripperSensors.getInfraredLeftFront());
            logger.debug("RightFront sensor: " + gripperSensors.getInfraredRightFront());

            logger.debug("LeftOutside sensor: " + gripperSensors.getInfraredLeftOutside());
            logger.debug("RightOutside sensor: " + gripperSensors.getInfraredRightOutside());

            logger.debug("LeftInsideNear sensor: " + gripperSensors.getInfraredLeftInsideNear());
            logger.debug("RightInsideNear sensor: " + gripperSensors.getInfraredRightInsideNear());
            logger.debug("LeftInsideFar sensor: " + gripperSensors.getInfraredLeftInsideFar());
            logger.debug("RightInsideFar sensor: " + gripperSensors.getInfraredRightInsideFar());

            //Force
            logger.debug("ForceLeftInsideNear sensor: " + gripperSensors.getForceLeftInsideNear());
            logger.debug("ForceRightInsideNear sensor: " + gripperSensors.getForceRightInsideNear());
            logger.debug("ForceLeftInsideFar sensor: " + gripperSensors.getForceLeftInsideFar());
            logger.debug("ForceRightInsideFar sensor: " + gripperSensors.getForceRightInsideFar());
        } catch (IOException | InterruptedException | ExecutionException ex) {
            logger.error("Error while trying to retrive the sensordata.");
        }
    }

    /**
     * Moves the arm to the given pose. !!!ATTENTION!!!: all joint will be moved
     * simultaneously some transitions can result in an arm-crash, e.g. if the
     * arm gets stuck in the base
     *
     * @param name name of the pose, can be looked up in
     * armserver/resources/KatanabasicMovements.xml
     * @return
     * @throws IOException
     */
    public Future<Boolean> directMovement(String name) throws IOException {
        return this.poseActuator.directMovement(name);

    }

    public void filterGrasps(String filter) {
        try {
            this.poseActuator.filterGrasps(filter);
        } catch (IOException ex) {
            logger.error("filterGrasps wont work");
        }
    }

    /**
     * Last knownPosition
     *
     * @return last assumed position
     */
    public String getLastPoseNew() {
        return lastKnownPose;
    }

    /**
     * Should recover the pose which is most likely
     */
    public void recoverPose() {
        try {
            lastKnownPose = getAssumePosition();
            logger.warn("ArmController.getAssumePosition is triggered!! New Posture set to: "
                    + lastKnownPose);
        } catch (IOException ex) {
            logger.error("ArmController.recoverPose / getAssumePosition wont work: "
                    + ex.getMessage());
        }

    }

    /**
     * Determines the pose which is most likely
     *
     * @return the pose which is most likey
     * @throws java.io.IOException poseActuator can not be read
     */
    public String getAssumePosition() throws IOException {
        try {
            Future<String> assumed = poseActuator.findNearestPose();
            logger.debug("assumed position: " + assumed);
            return assumed.get();
        } catch (IOException | InterruptedException | ExecutionException ex) {
            logger.error("Could not read the Armcontroller180!");
            throw new IOException(ex.getMessage());
        }
    }

    /**
     * Prints all information to the logger. skillsLogging.properties must be
     * set properly in robocupathome/src/main/resources
     */
    public void logDebugHandPosition() {

        logger.debug("Last known gripperPosition in ArmController.java: " + lastKnownPose);
        try {
            logger.debug("PoseActuator isSomethingInGripper: " + this.poseActuator.isSomethingInGripper());
            logger.debug("PoseActuator Position: " + this.poseActuator.getPosition());
        } catch (IOException ex) {
            logger.error("Cant log HandDebug.");
        }

    }

    /**
     * HandOverPose
     */
    public Future<Boolean> moveHandOver() {
        try {
            Future<Boolean> success = this.poseActuator.directMovement("grasp_up");
            lastKnownPose = "grasp_up";
            return success;
        } catch (IOException e) {
            logger.error("Error while moving to grasp_up.");
            return new Future<Boolean>() {
                @Override
                public boolean cancel(boolean mayInterruptIfRunning) {
                    return false;
                }

                @Override
                public Boolean get() throws InterruptedException, ExecutionException {
                    return false;
                }

                @Override
                public Boolean get(long timeout, TimeUnit unit)
                        throws InterruptedException, ExecutionException, TimeoutException {
                    return false;
                }

                @Override
                public boolean isCancelled() {
                    return false;
                }

                @Override
                public boolean isDone() {
                    return true;
                }
            };
        }
    }

    /**
     * HandOverPose
     */
    public Future<Boolean> moveHandOverLow() {
        try {
            Future<Boolean> success = this.poseActuator.directMovement("grasp_down");
            lastKnownPose = "grasp_down";
            return success;
        } catch (IOException e) {
            logger.error("Error while moving to hand_over_low.");
            return new Future<Boolean>() {
                @Override
                public boolean cancel(boolean mayInterruptIfRunning) {
                    return false;
                }

                @Override
                public Boolean get() throws InterruptedException, ExecutionException {
                    return false;
                }

                @Override
                public Boolean get(long timeout, TimeUnit unit)
                        throws InterruptedException, ExecutionException, TimeoutException {
                    return false;
                }

                @Override
                public boolean isCancelled() {
                    return false;
                }

                @Override
                public boolean isDone() {
                    return true;
                }
            };
        }
    }

    /**
     * Extends the arm fully and drops the object
     */
    public void moveDropObjectInTrash() {
        try {
            Future<Boolean> success = this.poseActuator.directMovement("extend_arm_full");
            if (success.get()) {
            }
            this.poseActuator.openGripper();
            success = poseActuator.directMovement("home");
            if (success.get()) {
            }
        } catch (IOException | InterruptedException | ExecutionException e) {
            logger.error("Error while moving to dropping.");
        }
    }

    /**
     * Lays Arm down with motors off.
     */
    public void moveLayDown() {
        try {
            Future<Boolean> success = this.poseActuator.directMovement("home");
            if (success.get()) {
            }
            this.poseActuator.openGripper();
            success = poseActuator.directMovement("home");
            if (success.get()) {
                this.poseActuator.motorsOff();
            }
        } catch (IOException | InterruptedException | ExecutionException e) {
            logger.error("Error while shuting down.");
        }

    }

    /**
     * Open gripper.
     *
     * @return
     */
    public boolean openGripper() {
        try {
            poseActuator.openGripper();
            return true;
        } catch (IOException e) {
            logger.error("openGripper in ArmController failed: " + e.getMessage());
            return false;
        }
    }

    /**
     * freeze katana.
     *
     * @return only returns true if we did not get an exception no method
     * present in armserver implemented to test if we really freezed
     */
    public boolean freeze() {
        try {
            poseActuator.freeze();
            return true;
        } catch (IOException e) {
            logger.error("freeze in Armcontroller failed: " + e.getMessage());
            return false;
        }
    }

    /**
     * unblock katana after motor crash.
     *
     * @return only if the command was send
     */
    public boolean unblock() {
        try {
            poseActuator.unblock();
            logger.info("Arm seems unblocked.");
            return true;
        } catch (IOException e) {
            logger.error("Error while trying to unblock.");
            return false;
        }
    }

    /**
     * Open gripper when touched from the outside.
     *
     * @param waitSeconds waits until the start, dunno why
     * @throws IOException
     */
    public void openGripperWhenTouching(int waitSeconds) throws IOException {
        poseActuator.openGripperWhenTouching(waitSeconds);
        waitAfterMovement();
    }

    /**
     * Gets the GrippersensorData.
     *
     * @return KatanaGripperData Sensor Data.
     * @throws java.io.IOException
     */
    public KatanaGripperData getGipperSensorData() throws IOException {
        try {
            return poseActuator.getGipperSensorData().get();
        } catch (IOException | InterruptedException | ExecutionException e) {
            logger.error("can not get the sensordata from the armserver");
            throw new IOException(e);
        }
    }

    /**
     * @DEPRECATED Since the control of the Katana arm is vulnerable to multiple
     * commands sent in too short time slots, it is necessary to wait for a few
     * seconds after each movement. 3 seconds worked just fine so far, but this
     * depends on both, the way ToBI and the Katana arm feels.
     */
    public void waitAfterMovement() {
        waitAfterMovement(WAITAFTERCOMMAND);
    }

    /**
     * @DEPRECATED Since the control of the Katana arm is vulnerable to multiple
     * commands sent in too short time slots, it is necessary to wait for a few
     * seconds after each movement. 3 seconds worked just fine so far, but this
     * depends on both, the way ToBI and the Katana arm feels.
     *
     * @param time Number of milliseconds to wait.
     */
    public void waitAfterMovement(long time) {
        try {
            Thread.sleep(time);
        } catch (InterruptedException ex) {
            logger.warn("Caught interrupt during waitAfterMovement!", ex);
        }
    }

    /**
     * This is the actual Grasp Method
     *
     * @param objectToGraspId the id of the object we want to grasp
     * @return
     */
    public Future<GraspActuator.MoveitResult> graspObject(ObjectShapeData shape, String group) {

        Future<GraspActuator.MoveitResult> grt = null;

        try {
            String objectName = shape.getId();
            logger.debug("sendig graspTarget to server: " + objectName + " with group " + group);
            grt = this.poseActuator.graspObject(objectName, group);

        } catch (IOException e) {
            logger.error("IOError of armserver: " + e.getMessage());
            return grt;
        }
        return grt;
    }

    /**
     * Removes the object which is most likely itself from the list
     *
     * @param objectToGrasp
     * @param otherObjects
     * @return if the object was found
     */
    private boolean removeSelfFromList(ObjectShapeData object,
            ObjectShapeList objectsList) {
        int selfIndex = nearestObjectInList(object, objectsList);
        if (selfIndex > -1) {
            objectsList.remove(selfIndex);
            return true;
        }
        return false;
    }

    /**
     * This is the Grasp Test Method
     *
     * @param objectToGrasp
     * @param transform transform the position from kinect to arm before
     * execution
     * @param allObjects
     * @return
     */
    public Future<GraspReturnType> isObjectGraspable(int objectToGraspId, int supportSurfaceId, String group) {

        try {
            String objectName = String.valueOf(objectToGraspId);
            String surfaceName = "surface" + supportSurfaceId;
            logger.debug("sendig graspTarget to server: " + objectName + " " + surfaceName + " with group " + group);
            return this.poseActuator.isObjectGraspable(objectName, group);

        } catch (IOException e) {
            logger.error("IO error with the PoseActuator" + e.getMessage());
            return generateFailFuture();
        }
    }

    /**
     * This is the placing method
     *
     * @param position Position to place at.
     * @return
     */
    public Future<GraspReturnType> placeObjectInRegion(ObjectShapeData region) {
        try {
            return this.poseActuator.placeObjectOn(region);

        } catch (IOException e) {
            logger.error(e.getMessage());
            return generateFailFuture();
        }
    }

    /**
     * This is the placing method
     *
     * @param position Position to place at.
     * @return
     */
    public Future<GraspReturnType> placeObjectOnSurface(String surfaceName) {
        try {
            return this.poseActuator.placeObjectOnSurface(surfaceName);
        } catch (IOException e) {
            logger.error(e.getMessage());
            return generateFailFuture();
        }
    }
    
    /**
     * Place on surface at specific height
     * @param height
     * @return 
     */
    public Future<GraspReturnType> placeObjectOnSurface(float height){
        try{
            return this.poseActuator.placeObjectOnSurface(height);
        }catch(IOException e){
            logger.error(e.getMessage());
            return generateFailFuture();
        }
    }

    private Future<GraspReturnType> generateFailFuture() {
        return new Future<GraspReturnType>() {
            @Override
            public boolean cancel(boolean mayInterruptIfRunning) {
                return false;
            }

            @Override
            public GraspReturnType get() throws InterruptedException, ExecutionException {
                return new GraspReturnType(0, 0, 0, LengthUnit.METER, 0, GraspResult.FAIL, "");
            }

            @Override
            public GraspReturnType get(long timeout, TimeUnit unit)
                    throws InterruptedException, ExecutionException, TimeoutException {
                return new GraspReturnType(0, 0, 0, LengthUnit.METER, 0, GraspResult.FAIL, "");
            }

            @Override
            public boolean isCancelled() {
                return false;
            }

            @Override
            public boolean isDone() {
                return true;
            }
        };
    }

    /**
     * WARNING!! don not use this unless you know what you do!! Turns the Motors
     * off
     *
     * @throws java.io.IOException
     */
    public void motorsOff() throws IOException {
        poseActuator.motorsOff();
    }

    /**
     * Turns the Motors on
     *
     * @throws IOException
     */
    public void motorsOn() throws IOException {
        poseActuator.motorsOn();
    }

    /**
     * Gets the the object in the list which is the most likely to be the object
     * we want to grasp
     *
     * @param objectToGrasp
     * @param otherObjects
     * @return index of the object in otherObjects
     */
    public int nearestObjectInList(ObjectShapeData objectToGrasp,
            ObjectShapeList otherObjects) {
        double bestEps = Double.MAX_VALUE;
        double tempEps;
        int index = -1;

        for (int i = 0; i < otherObjects.size(); i++) {
            tempEps = objectToGrasp.getEpsilonToOtherObject(otherObjects.get(i));
            if (tempEps < bestEps) {
                bestEps = tempEps;
                index = i;
            }
        }
        logger.debug("Object we want to grasp: " + objectToGrasp.toString());
        if (index != -1) {
            logger.debug("calculated nearestObjectInList is:" + otherObjects.get(index).toString());
        }

        return index;
    }

    public double calcDirectGraspingAngle(Point3D targetPosition) {
        double angle;
        if (targetPosition.getY(LengthUnit.METER) != 0.0) {
            angle = -1.0
                    * Math.signum(targetPosition.getY(LengthUnit.METER))//if  angle is on the same axis
                    * Math.asin(Math.abs(targetPosition.getY(LengthUnit.METER))
                            / (Math.abs(targetPosition.getZ(LengthUnit.METER)) + Math.abs(targetPosition.getY(LengthUnit.METER))));
        } else {
            angle = 0.0;
        }
        return angle;
    }

    public Point3D rotatePointAroundRobotBase(Point3D point, double angleInRad) {
        double z = point.getZ(LengthUnit.METER) + OFFSET_TO_ROBOT_BASE_METER;
        double y = point.getY(LengthUnit.METER);
        double x = point.getX(LengthUnit.METER);

        double newZ = (z * Math.cos(angleInRad) - y * Math.sin(angleInRad) - OFFSET_TO_ROBOT_BASE_METER);
        logger.debug("z = " + z + "cos(angleInRad) = " + Math.cos(angleInRad) + " y = " + y + " Math.sin(angleInRad) = " + Math.sin(angleInRad) + " newZ = " + newZ);
        double newY = (z * Math.sin(angleInRad) + y * Math.cos(angleInRad));
        logger.debug("z = " + z + " sin(angleInRad) = " + Math.sin(angleInRad) + " y = " + y + " cos(angleInRad) = " + Math.cos(angleInRad) + " newY= " + newY);
        return new Point3D(x, newY, newZ, LengthUnit.METER);
    }

    public List<String> getPoseList() throws IOException, InterruptedException, ExecutionException {
        List<String> l = new LinkedList<>();
        l = poseActuator.listPoses().get();
        return l;

    }

    public void findObjects() throws IOException {
        logger.debug("## Invoked findObjects in ArmController180");
        poseActuator.fitObjectsToPrimitives();
    }
}
