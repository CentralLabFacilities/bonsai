
package de.unibi.citec.clf.bonsai.core.exception;

/**
 * Exception thrown for parsing errors.
 *
 * @author jwienke
 */
public class ParseException extends RuntimeException {

    /**
     * Serial version UID.
     */
    private static final long serialVersionUID = 2656964892576461162L;

    /**
     * Constructor.
     *
     * @param message
     *            exception description
     */
    public ParseException(String message) {
        super(message);
    }

    /**
     * Constructor.
     *
     * @param message
     *            exception description
     * @param cause
     *            exception cause
     */
    public ParseException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * Constructor.
     *
     * @param cause
     *            exception cause
     */
    public ParseException(Throwable cause) {
        super(cause);
    }
    
}
