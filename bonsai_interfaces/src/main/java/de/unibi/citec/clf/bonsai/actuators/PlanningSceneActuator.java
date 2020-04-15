
package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

import java.util.concurrent.Future;

/**
 *
 * @author jkummert
 */
public interface PlanningSceneActuator extends Actuator{

    Future<Boolean> clearScene(boolean keep_attached_objects);
    Future<Boolean> addObjects(ObjectShapeList objects);
    
    Future<Boolean> manage();
}
