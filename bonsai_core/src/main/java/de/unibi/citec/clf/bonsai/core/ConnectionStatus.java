package de.unibi.citec.clf.bonsai.core;



/**
 * Class representing the connection status of a component (sensor/actuator).
 * 
 * @author nkoester
 * 
 * 
 */
public class ConnectionStatus {

    /**
     * Holds the information about the current connection Status.
     */
    private boolean componentConnectionStatus;

    /**
     * Constructor to create the object with a status. True = active, False =
     * inactive
     * 
     * @param componentConnectionStatus
     *            the connection status of the component
     */
    public ConnectionStatus(boolean componentConnectionStatus) {
        this.componentConnectionStatus = componentConnectionStatus;
    }

    /**
     * Sets the actual connection status of the component. Note: This function
     * is thought to be used _only_ by factories.
     * 
     * @param componentConnectionStatus
     *            the current status of the connectivity
     */
    protected void setStatus(boolean componentConnectionStatus) {
        this.componentConnectionStatus = componentConnectionStatus;
    }

    /**
     * Returns the actual connection status of the component.
     * 
     * @return true if the component is connected, false otherwise
     */
    public boolean getConnectionStatus() {
        return this.componentConnectionStatus;
    }

}
