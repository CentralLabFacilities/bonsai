package de.unibi.citec.clf.bonsai.actuators.deprecated;


import de.unibi.citec.clf.bonsai.actuators.ManipulationActuator;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.grasp.GraspReturnType;
import de.unibi.citec.clf.btl.data.grasp.KatanaGripperData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.Future;
@Deprecated
public interface PicknPlaceActuator extends ManipulationActuator {

    /**
     * Move a Joint of the arm.
     *
     * @param joint
     * @param value
     * @throws IOException
     */
    Future<Void> moveJoint(int joint, double value) throws IOException;

    /**
     * List all angles.
     *
     * @return joints in a LinkList
     * @throws IOException
     */
    Future<List<Double>> listJoints() throws IOException;

    /**
     * Goto a single Position (fully described by P,N,O,A).
     *
     * @param pose pose of move to
     * @return <code>true</code> if the position is reachable,
     * <code>false</code> if not
     * @throws IOException
     */
    Future<Boolean> goTo(Pose3D pose) throws IOException;

    /**
     * List all available Poses.
     *
     * @return Movements in a LinkedList
     * @throws IOException
     */
    Future<List<String>> listPoses() throws IOException;

    /**
     * Get nearest known pose.
     *
     * @return pose name
     * @throws IOException
     */
    Future<String> findNearestPose() throws IOException;

    /**
     * Set a special Movement.
     *
     * @param name
     * @return
     * @throws IOException
     */
    Future<Boolean> directMovement(String name) throws IOException;

    Future<Boolean> planMovement(String name) throws IOException;

    /**
     * Turns All Motors Off.
     *
     * @throws IOException
     */
    void motorsOff() throws IOException;

    /**
     * Turns All Motors On.
     *
     * @throws IOException
     */
    void motorsOn() throws IOException;

    /**
     * Open the Gripper of the arm.
     *
     * @throws IOException
     */
    void openGripper() throws IOException;

    /**
     * Close the Gripper of the arm.
     */
    void closeGripper() throws IOException;

    /**
     * Open gripper when touching
     *
     * @throws IOException
     */
    void openGripperWhenTouching(int waitSeconds) throws IOException;

    /**
     * Get the Gripper sensor data
     *
     * @return sensor data of the gripper
     * @throws IOException
     */
    Future<KatanaGripperData> getGipperSensorData() throws IOException;

    /**
     * Closing Gripper until a define force is achieved
     *
     * @throws IOException
     */
    void closeGripperByForce() throws IOException;

    /**
     * Get the current position of the Gripper.
     *
     * @return
     */
    Future<Pose3D> getPosition() throws IOException;

    /**
     * Freezes the arm.
     *
     * @return
     */
    void freeze() throws IOException;

    /**
     * Unfreezes the arm.
     *
     * @return
     */
    void unblock() throws IOException;

    Future<GraspReturnType> isObjectGraspable(String objectName, String group) throws IOException;

    Future<GraspReturnType> placeObjectOnSurface(String surfaceName) throws IOException;

    Future<GraspReturnType> placeObjectOnSurface(float heigth) throws IOException;

    Future<GraspReturnType> placeObjectOn(ObjectShapeData region) throws IOException;

    Future<Boolean> isSomethingInGripper() throws IOException;

    void fitObjectsToPrimitives() throws IOException;

    void filterGrasps(String filter) throws IOException;

}
