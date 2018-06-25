package de.unibi.citec.clf.bonsai.core.object;

import de.unibi.citec.clf.bonsai.core.ConnectionStatus;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;



/**
 * Interface for actuators and sensors.
 * 
 * @author sebschne
 * @author nkoester
 * @author jwienke
 */
public interface ManagedCoreObject {

    /**
     * An object holding the actual connection state.
     * 
     */
    ConnectionStatus connectionStatus = new ConnectionStatus(false);
    
    
    void configure(IObjectConfigurator conf) throws ConfigurationException;

    /**
     * Close all communication channels.
     */
    void cleanUp();
}
