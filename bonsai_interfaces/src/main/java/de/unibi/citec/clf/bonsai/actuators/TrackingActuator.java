
package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;
import java.util.List;
import java.util.concurrent.Future;

/**
 *
 * @author jkummert
 */
public interface TrackingActuator extends Actuator{

    /**
     *
     * @param boundingbox x ,y ,h, w
     */
    Future<Boolean> startTracking(List<Integer> boundingbox);
    void stopTracking();
}
