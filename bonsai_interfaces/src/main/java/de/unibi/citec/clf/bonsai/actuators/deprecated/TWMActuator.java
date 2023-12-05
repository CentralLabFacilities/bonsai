package de.unibi.citec.clf.bonsai.actuators.deprecated;



import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.util.List;
import java.util.concurrent.Future;
@Deprecated
public interface TWMActuator extends Actuator {

    List<String> getAllEntityNames();
    List<String> getAllEntityViews(String entity);
    
    Future<Boolean> simpleDriveToView(String entity, String view);
    Future<Boolean> simpleTriggerMatching(String entity, String view);

}
