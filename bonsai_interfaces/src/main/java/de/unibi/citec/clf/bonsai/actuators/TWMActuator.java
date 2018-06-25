package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.util.List;
import java.util.concurrent.Future;

public interface TWMActuator extends Actuator {

    List<String> getAllEntityNames();
    List<String> getAllEntityViews(String entity);
    
    Future<Boolean> simpleDriveToView(String entity, String view);
    Future<Boolean> simpleTriggerMatching(String entity, String view);

}
