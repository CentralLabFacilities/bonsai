
package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.Type;

import java.io.IOException;

/**
 *
 * @author lruegeme
 */
public interface SendDataActuator extends Actuator{

    void sendData(Type data) throws IOException;
}
