package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.util.StoringGroceriesResult;

import java.io.IOException;
import java.util.concurrent.Future;

public interface StoringGroceriesActuator extends Actuator {

    Future<StoringGroceriesResult> getResult(String action) throws IOException;

}
