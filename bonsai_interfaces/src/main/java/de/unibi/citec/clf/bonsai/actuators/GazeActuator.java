package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import java.io.IOException;

import java.util.concurrent.Future;

/**
 * Interface to control gaze
 * 
 * @author lruegeme
 */
public interface GazeActuator extends Actuator {


    //TODO should be Point3D

    Future<Void> lookAt(Pose3D pose);

    /**
     *
     * @param pose
     * @param duration in ms
     * @return
     */
    Future<Void> lookAt(Pose3D pose, long duration);

    void manualStop() throws IOException;

    @Deprecated
    void setGazeTarget(float pitch, float yaw);
    @Deprecated
    void setGazeTarget(float pitch, float yaw, float speed);
    @Deprecated
    Future<Boolean> setGazeTargetPitchAsync(float pitch, float duration);
    @Deprecated
    Future<Boolean> setGazeTargetYawAsync(float yaw, float duration);
    @Deprecated
    Future<Boolean> setGazeTargetAsync(float pitch, float yaw);
    @Deprecated
    Future<Boolean> setGazeTargetAsync(float pitch, float yaw, float duration);
    @Deprecated
    void setGazeTargetPitch(float pitch);
    @Deprecated
    void setGazeTargetYaw(float yaw);


}
