package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import java.io.IOException;

import java.util.concurrent.Future;

/**
 * New interface to control gaze tools
 * 
 * @author lruegeme
 */
public interface GazeActuator extends Actuator {

    @Deprecated
    void setGazeTarget(float pitch, float yaw);

    Future<Boolean> setGazeTargetPitchAsync(float pitch, float duration);

    Future<Boolean> setGazeTargetYawAsync(float yaw, float duration);

    @Deprecated
    Future<Boolean> setGazeTargetAsync(float pitch, float yaw);
    @Deprecated
    Future<Boolean> setGazeTargetAsync(float pitch, float yaw, float duration);

    void setGazeTargetPitch(float pitch);

    void setGazeTargetYaw(float yaw);

    Future<Void> lookAt(Pose3D pose);
    Future<Void> lookAt(Pose3D pose, float duration);
    
    void manualStop() throws IOException;
}
