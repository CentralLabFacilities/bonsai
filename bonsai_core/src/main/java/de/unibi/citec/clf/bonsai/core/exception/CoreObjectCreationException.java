package de.unibi.citec.clf.bonsai.core.exception;

/**
 * Exception indicating an error while creating a new instance of a managed
 * object.
 *
 * @author jwienke
 */
public class CoreObjectCreationException extends RuntimeException {

    private String key = "(unnamed)";
    /**
     * Serial version UID.
     */
    private static final long serialVersionUID = 1884532122904715170L;

    /**
     * Constructor.
     *
     * @param message exception description.
     */
    public CoreObjectCreationException(String message) {
        super(message);
    }

    /**
     * Constructor.
     *
     * @param message exception description
     * @param cause   exception cause
     */
    public CoreObjectCreationException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * Constructor.
     *
     * @param cause exception cause
     */
    public CoreObjectCreationException(Throwable cause) {
        super(cause);
    }

    /**
     * Constructor.
     *
     * @param message exception description.
     * @param key     Key of the core object that caused the exception.
     */
    public CoreObjectCreationException(String message, String key) {
        super(message);
        this.key = key;
    }

    /**
     * Constructor.
     *
     * @param message exception description
     * @param cause   exception cause
     * @param key     Key of the core object that caused the exception.
     */
    public CoreObjectCreationException(String message, Throwable cause, String key) {
        super(message, cause);
        this.key = key;
    }

    /**
     * Constructor.
     *
     * @param cause exception cause
     * @param key   Key of the core object that caused the exception.
     */
    public CoreObjectCreationException(Throwable cause, String key) {
        super(cause);
        this.key = key;
    }

    /**
     * Key of the core object that caused the exception.
     *
     * @return Key of the core object that caused the exception.
     */
    public String getKey() {
        return key;
    }

}
