
package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;

import java.util.List;
import java.util.concurrent.ExecutionException;

/**
 *
 * @author jkummert
 */
public interface GetCrowdAttributesActuator extends Actuator{
    
    List<PersonAttribute> getCrowdAttributes() throws InterruptedException, ExecutionException;

}
