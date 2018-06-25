
package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Interface to ros control
 * 
 * @author llach
 */
public interface JointControllerActuator extends Actuator{
    
    /**
     * Moves the Z-Lift to given position
     * 
     * @param dist
     * @return
     * @throws IOException 
     */
    Future<Boolean> goToZliftHeight(float dist) throws IOException;

    Future<Boolean> goToHeadPose(float j0, float j1) throws IOException;
    
}
