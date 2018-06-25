
package de.unibi.citec.clf.bonsai.core.exception;

/**
 * F Exception indicating an error in the Bonsai core configuration.
 *
 * @author jwienke
 */
public class ConfigurationException extends RuntimeException {

    /**
     * Serial version UID.
     */
    private static final long serialVersionUID = -8111248937260206718L;

    /**
     * Constructor.
     */
    public ConfigurationException() {
        super();
    }

    /**
     * Constructor.
     *
     * @param message exception description
     * @param cause cause of the exception
     */
    public ConfigurationException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * Constructor.
     *
     * @param message exception description
     */
    public ConfigurationException(String message) {
        super(message);
    }

    /**
     * Constructor.
     *
     * @param cause cause of the exception
     */
    public ConfigurationException(Throwable cause) {
        super(cause);
    }
    
}
