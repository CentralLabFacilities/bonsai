package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.object.ObjectLocationData;
import java.util.concurrent.ExecutionException;

/**
 *
 * @author saschroeder
 */
public interface ObjectDetectionActuator extends Actuator {
    List<ObjectLocationData> detect() throws InterruptedException, ExecutionException;
}
