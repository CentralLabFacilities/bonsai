
package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;
import java.io.IOException;
import java.util.concurrent.Future;

/**
 *
 * @author llach
 */
public interface GuidingActuator extends Actuator {
    
    Future<Boolean> startGuiding() throws IOException;
    void stopGuiding() throws IOException;
    
}
