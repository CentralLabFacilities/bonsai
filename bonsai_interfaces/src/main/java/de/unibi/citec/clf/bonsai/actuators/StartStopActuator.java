package de.unibi.citec.clf.bonsai.actuators;



import java.io.IOException;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

/**
 * Interface for actuator that start and stops processing of components.
 * 
 * @author lziegler
 */
public interface StartStopActuator extends Actuator {

    /**
     * Start processing.
     * 
     * @throws IOException
     *             communication error
     */
    void startProcessing() throws IOException;

    /**
     * Stop processing.
     * 
     * @throws IOException
     *             communication error
     */
    void stopProcessing() throws IOException;

}
