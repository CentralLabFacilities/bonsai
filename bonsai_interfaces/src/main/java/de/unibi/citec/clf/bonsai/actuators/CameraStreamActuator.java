package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;

/**
 * Interface to control camera streams
 * 
 * @author jkummert
 */
public interface CameraStreamActuator extends Actuator {

    
    boolean enableDepthStream(boolean enable);
    
    boolean enableColorStream(boolean enable);
}
