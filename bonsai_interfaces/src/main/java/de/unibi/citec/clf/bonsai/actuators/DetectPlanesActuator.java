
package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatchList;
import java.util.concurrent.ExecutionException;

/**
 *
 * @author ffriese
 */
public interface DetectPlanesActuator extends Actuator{
    
    PlanePatchList detect() throws InterruptedException, ExecutionException;
}
