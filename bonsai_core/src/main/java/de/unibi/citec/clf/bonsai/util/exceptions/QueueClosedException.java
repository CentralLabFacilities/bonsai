package de.unibi.citec.clf.bonsai.util.exceptions;



/**
 * This exception is thrown if someone accesses a closed synchronized queue.
 * 
 * @author lkettenb
 */
public class QueueClosedException extends RuntimeException {

    public QueueClosedException(String message) {
        super(message);
    }
}
