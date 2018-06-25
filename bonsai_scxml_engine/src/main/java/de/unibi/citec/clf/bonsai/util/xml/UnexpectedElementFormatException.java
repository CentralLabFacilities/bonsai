package de.unibi.citec.clf.bonsai.util.xml;


/**
 * Indicating an unexpected format of an XML element.
 */
public class UnexpectedElementFormatException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    /**
     * Constructor.
     */
    public UnexpectedElementFormatException() {
    }

    /**
     * Constructor.
     *
     * @param message exception description
     */
    public UnexpectedElementFormatException(String message) {
        super(message);
    }

    /**
     * Constructor.
     *
     * @param cause exception cause
     */
    public UnexpectedElementFormatException(Throwable cause) {
        super(cause);
    }

    /**
     * Constructor.
     *
     * @param message exception description
     * @param cause   exception cause
     */
    public UnexpectedElementFormatException(String message, Throwable cause) {
        super(message, cause);
    }

}
