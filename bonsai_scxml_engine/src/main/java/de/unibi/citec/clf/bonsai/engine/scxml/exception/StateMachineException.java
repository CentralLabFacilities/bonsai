package de.unibi.citec.clf.bonsai.engine.scxml.exception;


public class StateMachineException extends RuntimeException {
    private static final long serialVersionUID = -802343881076072009L;

    public StateMachineException(String msg) {
        super(msg);
    }

    public StateMachineException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
