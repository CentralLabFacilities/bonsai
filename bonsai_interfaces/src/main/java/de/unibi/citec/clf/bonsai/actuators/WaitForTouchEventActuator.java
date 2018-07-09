
package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.util.concurrent.Future;


/**
 *
 * @author ffriese
 */
public interface WaitForTouchEventActuator extends Actuator{

    Future<Boolean> waitForTouchEvent(String sensor_name); // TODO: implement boolean wait_for_release;
}
