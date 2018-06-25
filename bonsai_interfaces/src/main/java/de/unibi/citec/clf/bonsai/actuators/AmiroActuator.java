package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;

/**
 *
 */
public interface AmiroActuator extends Actuator {

    void doCalibrateMovement();

    void sendNavigate(Pose3D placeTarget);

    boolean isDone();
}
