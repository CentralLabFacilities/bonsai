
package de.unibi.citec.clf.bonsai.core.exception;

/**
 * Indicating an error initializing a {@link CoreObjectFactory}.
 *
 * @author jwienke
 */
public class InitializationException extends RuntimeException {

    /**
     * Serial version UID.
     */
    private static final long serialVersionUID = 1324236151542361611L;

    /**
     * Constructor.
     */
    public InitializationException() {
        super();
    }

    /**
     * Constructor.
     *
     * @param message
     *            exception description
     * @param cause
     *            exception cause
     */
    public InitializationException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * Constructor.
     *
     * @param message
     *            exception description
     */
    public InitializationException(String message) {
        super(message);
    }

    /**
     * Constructor.
     *
     * @param cause
     *            exception cause
     */
    public InitializationException(Throwable cause) {
        super(cause);
    }
    
}
