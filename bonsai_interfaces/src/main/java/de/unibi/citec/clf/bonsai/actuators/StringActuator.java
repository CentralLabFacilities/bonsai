
package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.io.IOException;

/**
 *
 * @author jgerlach
 */
public interface StringActuator extends Actuator{
    
    String getTarget();
    void sendString(String data) throws IOException;
}
