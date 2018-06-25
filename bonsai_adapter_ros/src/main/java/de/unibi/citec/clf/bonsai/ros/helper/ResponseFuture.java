package de.unibi.citec.clf.bonsai.ros.helper;


import org.ros.exception.RemoteException;
import org.ros.internal.message.Message;
import org.ros.node.service.ServiceResponseListener;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * @param <M>
 * @author lruegeme
 */
public class ResponseFuture<M extends Message> implements Future<M>, ServiceResponseListener<M> {

    M response = null;
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
    public M get() throws InterruptedException, ExecutionException {
        while (!finished) {
            Thread.sleep(50);
        }
        if (error != null) {
            throw new ExecutionException(error);
        }
        return response;
    }

    @Override
    public M get(long l, TimeUnit tu) throws InterruptedException, ExecutionException, TimeoutException {
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
        return response;
    }

    @Override
    public void onSuccess(M mt) {
        response = mt;
        finished = true;
    }

    @Override
    public void onFailure(RemoteException re) {
        error = re;
        finished = true;
    }

    public Future<Boolean> toBooleanFuture() {
        final ResponseFuture res = this;
        return new Future<Boolean>() {
            @Override
            public boolean cancel(boolean bln) {
                return res.cancel(bln);
            }

            @Override
            public boolean isCancelled() {
                return res.isCancelled();
            }

            @Override
            public boolean isDone() {
                return res.isDone();
            }

            @Override
            public Boolean get() throws InterruptedException, ExecutionException {
                try {
                    res.get();
                    return true;
                } catch (ExecutionException ex) {
                    return false;
                }
            }

            @Override
            public Boolean get(long l, TimeUnit tu) throws InterruptedException, ExecutionException, TimeoutException {
                try {
                    res.get(l, tu);
                    return true;
                } catch (ExecutionException ex) {
                    return false;
                }
            }
        };
    }

}
