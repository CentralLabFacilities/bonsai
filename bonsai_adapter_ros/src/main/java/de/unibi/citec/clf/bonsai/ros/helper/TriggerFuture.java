package de.unibi.citec.clf.bonsai.ros.helper;


import org.ros.exception.RemoteException;
import org.ros.node.service.ServiceResponseListener;
import std_srvs.TriggerResponse;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * @author lruegeme
 */
public class TriggerFuture implements Future<Boolean>, ServiceResponseListener<TriggerResponse> {

    TriggerResponse response = null;
    boolean finished = false;
    RemoteException error = null;

    public boolean succeeded() {
        return finished && error == null;
    }

    public RemoteException getException() {
        return error;
    }

    @Override
    public boolean cancel(boolean bln) {
        return false;
    }

    @Override
    public boolean isCancelled() {
        return false;
    }

    @Override
    public boolean isDone() {
        return finished;
    }

    @Override
    public Boolean get() throws InterruptedException, ExecutionException {
        while (!finished) {
            Thread.sleep(50);
        }
        if (error != null) {
            throw new ExecutionException(error);
        }
        return response.getSuccess();
    }

    @Override
    public Boolean get(long l, TimeUnit tu) throws InterruptedException, ExecutionException, TimeoutException {
        long timeout = System.currentTimeMillis() + tu.toMillis(l);
        while (!finished) {
            if (System.currentTimeMillis() > timeout) {
                throw new TimeoutException();
            }
            Thread.sleep(50);
        }
        if (error != null) {
            throw new ExecutionException(error);
        }
        return response.getSuccess();
    }

    @Override
    public void onSuccess(TriggerResponse mt) {
        response = mt;
        finished = true;
    }

    @Override
    public void onFailure(RemoteException re) {
        error = re;
        finished = true;
    }

}
