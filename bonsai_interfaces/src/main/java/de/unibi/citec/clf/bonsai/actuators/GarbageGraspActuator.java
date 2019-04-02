package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.util.GarbageGraspResult;

import java.io.IOException;
import java.util.concurrent.Future;

public interface GarbageGraspActuator extends Actuator {

    Future<GarbageGraspResult> getResult() throws IOException;

}
