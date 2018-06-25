
package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;

import java.util.concurrent.ExecutionException;

/**
 *
 * @author jkummert
 */
public interface GetPersonAttributesActuator extends Actuator{
    
    PersonAttribute getPersonAttributes(String id) throws InterruptedException, ExecutionException;
}
