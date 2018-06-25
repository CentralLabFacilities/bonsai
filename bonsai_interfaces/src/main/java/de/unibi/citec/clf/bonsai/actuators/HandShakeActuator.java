package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Created by lruegeme on 25.10.16.
 */
public interface HandShakeActuator extends Actuator {

    void simpleShakeHand() throws IOException;
    Future<Boolean> shakeHand() throws IOException;



}
