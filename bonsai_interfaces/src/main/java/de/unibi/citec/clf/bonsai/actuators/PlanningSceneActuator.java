
package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import java.util.concurrent.Future;

/**
 *
 * @author jkummert
 */
public interface PlanningSceneActuator extends Actuator{
    
    Future<Boolean> manage();
}
