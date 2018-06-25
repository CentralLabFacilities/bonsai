package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import java.util.concurrent.Future;

/**
 * Interface to learn and recognize persons
 * 
 * @author jkummert
 */
public interface LearnPersonActuator extends Actuator {

    /**
     * Add this person to the list of known classes.
     * 
     * @param id the uuid of the person assigned by the personsensor.
     * @param name class id
     * @return learning successful
     */
    Future<Boolean> learnPerson(String id, String name);
    
    /**
     * Is this person currently known?
     * 
     * @param uuid the uuid of the person assigned by the personsensor
     * @return the class label
     */
    Future<String> doIKnowThatPerson(String uuid);
}
