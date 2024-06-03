package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.geometry.Point3D;

import java.io.IOException;

import java.util.concurrent.Future;

/**
 * Interface to control gaze
 * 
 * @author lruegeme
 */
public interface GazeActuator extends Actuator {
    
    Future<Void> lookAt(Point3D point);

    /**
     *
     * @param point
     * @param duration minimal movement duration in ms
     * @return
     */
    Future<Void> lookAt(Point3D point, long duration);

    /**
     * Look at a point, moving at least minDuration milliseconds with below maxVelocity rad/s
     *
     * @param point the point to look at
     * @param maxVelocity maximum velocity until we look at the point
     * @param minDuration
     * @return
     */
    Future<Void> lookAt(Point3D point, double maxVelocity, long minDuration);

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
