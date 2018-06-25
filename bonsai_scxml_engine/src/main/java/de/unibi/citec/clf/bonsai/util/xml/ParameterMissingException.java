package de.unibi.citec.clf.bonsai.util.xml;


/**
 * Thrown when an expected parameter is missing.
 *
 * @author Ingo Luetkebohle
 */
public class ParameterMissingException extends Exception {

    /**
     * Serializable stuff...
     */
    private static final long serialVersionUID = -3890770741104178981L;

    /**
     * Create exception with given message.
     *
     * @param msg exception description
     */
    public ParameterMissingException(String msg) {
        super(msg);
    }

    /**
     * Create exception with given message and cause.
     *
     * @param msg   exception description
     * @param cause exception cause
     */
    public ParameterMissingException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
