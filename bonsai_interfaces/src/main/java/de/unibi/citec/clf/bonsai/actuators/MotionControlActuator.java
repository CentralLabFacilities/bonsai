package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.util.Map;
import java.util.concurrent.Future;

public interface MotionControlActuator extends Actuator {

    Future<Boolean> enableCorrection(boolean enable);

    void setStiffness(Map<String, Double> joints);
}
