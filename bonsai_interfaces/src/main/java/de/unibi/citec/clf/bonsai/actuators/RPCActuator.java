package de.unibi.citec.clf.bonsai.actuators;



import java.util.concurrent.ExecutionException;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

/**
 * This interface provides access to remote server methods of the middleware.
 * 
 * @author lkettenb
 */
public interface RPCActuator extends Actuator {

    /**
     * Use this method if you want to submit data and/or await a result.
     * 
     * @param <U>
     *            Type of the result.
     * @param <T>
     *            Type of the data that will be submitted.
     * @param data
     *            Data that will be submitted.
     * @return Result of the remote server call.
     */
    <U, T> U call(T data) throws ExecutionException;

    /**
     * Use this method if no data needs to be submitted.
     */
    void call() throws ExecutionException;

}
