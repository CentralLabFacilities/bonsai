
package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;

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
    Future<Boolean> startTracking(Point3D lastPose, Double threshold);
    void stopTracking();
}
