package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.util.concurrent.Future;

public interface BooleanActuator extends Actuator {

    Future<Boolean> setStatus(Boolean status);
}