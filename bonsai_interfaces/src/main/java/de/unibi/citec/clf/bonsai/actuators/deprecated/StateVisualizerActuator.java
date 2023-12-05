package de.unibi.citec.clf.bonsai.actuators.deprecated;



import java.io.IOException;
import java.util.Set;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

/**
 * Actuator interface to control a visualization of the current system state.
 * 
 * @author jwienke
 */
@Deprecated
public interface StateVisualizerActuator extends Actuator {

    /**
     * Configures the visualizer. This must be done before notifying state
     * changes. A second call to this method simply overrides the old
     * configuration.
     * 
     * @param systemName
     *            a descriptive name of the system who's states are shown
     * @param states
     *            a complete list of all possible system states.
     * @throws IOException
     *             communication error
     */
    void configure(String systemName, Set<String> states) throws IOException;

    /**
     * Notifies that the system is in a new state.
     * 
     * @param state
     *            name of the new state. Must have been configured with
     *            {@link #configure(String, Set)} before.
     * @throws IOException
     *             communication error
     */
    void setState(String state) throws IOException;

}
