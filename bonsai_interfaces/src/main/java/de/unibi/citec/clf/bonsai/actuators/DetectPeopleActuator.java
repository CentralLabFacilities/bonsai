
package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.person.BodySkeleton;

import de.unibi.citec.clf.btl.List;
import java.util.concurrent.ExecutionException;

/**
 *
 * @author jkummert
 */
public interface DetectPeopleActuator extends Actuator{
    
    List<BodySkeleton> getPeople() throws InterruptedException, ExecutionException;
}
