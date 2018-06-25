package de.unibi.citec.clf.bonsai.actuators;



import java.io.IOException;
import java.util.concurrent.TimeoutException;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

/**
 * Interface for actuator that controls humavips face identification pipeline.
 * 
 * @author lziegler
 */
public interface FaceIdentificationHumavipsActuator extends Actuator {

    /**
     * Assign a new id.
     * 
     * @throws IOException
     *             communication error
     */
    void assignNewId() throws IOException, TimeoutException;

}
