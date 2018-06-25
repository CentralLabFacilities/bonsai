package de.unibi.citec.clf.bonsai.engine.scxml.exception;

/**
 * @author lruegeme
 */
public class StateNotFoundException extends ClassNotFoundException {

    private static final long serialVersionUID = 862982470160354831L;

    public StateNotFoundException(String msg, Throwable cause) {
        super(msg, cause);
    }

}
