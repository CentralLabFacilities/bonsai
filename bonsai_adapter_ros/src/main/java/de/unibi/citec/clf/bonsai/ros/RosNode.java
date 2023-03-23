package de.unibi.citec.clf.bonsai.ros;


import org.apache.log4j.Logger;
import org.ros.node.AbstractNodeMain;
import org.ros.node.ConnectedNode;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * @author lruegeme
 */
public abstract class RosNode extends AbstractNodeMain {

    private Logger logger = Logger.getLogger(getClass());
    public boolean initialized = false;
    public static final String NODE_PREFIX = "/bonsai/ros/";
    private String key = "";

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    @Override
    public abstract void onStart(ConnectedNode connectedNode);

    public final void cleanUp() {
    }

    public abstract void destroyNode();

    public Future<Boolean> isInitialised() {
        return new Future<Boolean>() {
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
                return initialized;
            }

            @Override
            public Boolean get() throws InterruptedException, ExecutionException {
                if (!initialized) {
                    //dont do this
                    throw new ExecutionException("dont get me", new Exception("nope"));
                }
                return true;
            }

            @Override
            public Boolean get(long l, TimeUnit tu) throws InterruptedException, ExecutionException, TimeoutException {
                long sleep_millies = tu.toMillis(l);
                long sleep_step = sleep_millies / 10;
                logger.trace("get isInitialized for  " + l + tu.toString());
                while (!initialized && sleep_millies > 0) {
                    sleep_millies -= sleep_step;
                    Thread.sleep(sleep_step);
                }

                if (!initialized) {
                    logger.trace("isInitialized false after " + l + tu.toString());
                    throw new TimeoutException("not initialized after " + l + tu.toString());
                }
                return initialized;
            }
        };
    }


}
