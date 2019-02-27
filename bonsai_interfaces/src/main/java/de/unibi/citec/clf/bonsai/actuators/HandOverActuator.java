package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Created by semeyerz on 29.03.17.
 */
public interface HandOverActuator extends Actuator {

    Future<Boolean> handOver(String group_name, byte type) throws IOException;

    /**
     *  measures force change in the given group
     *  using value at call time as zero
     */
    Future<Boolean> checkForce(String group_name, float threshold) throws IOException;

}
