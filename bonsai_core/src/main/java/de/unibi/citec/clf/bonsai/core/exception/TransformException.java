package de.unibi.citec.clf.bonsai.core.exception;

/**
 * @author lruegeme
 */
public class TransformException extends Exception {

    private static final long serialVersionUID = 6531013125916628862L;

    public TransformException(String from, String to, long time, String msg) {
        super("Cannot transform from \"" + from + "\" to \"" + to + "\" at time " + time + ". Reason: " + msg);
    }

    public TransformException(String from, String to, long time) {
        super("Cannot transform from \"" + from + "\" to \"" + to + "\" at time " + time);
    }

    public TransformException(String msg) {
        super(msg);
    }

}
