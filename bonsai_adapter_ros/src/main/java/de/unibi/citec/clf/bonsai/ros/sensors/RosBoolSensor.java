package de.unibi.citec.clf.bonsai.ros.sensors;


import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.ros.RosSensor;
import de.unibi.citec.clf.bonsai.util.BoundSynchronizedQueue;
import org.apache.log4j.Logger;
import org.ros.message.MessageListener;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Subscriber;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

/**
 *
 * @author lruegeme
 */
public class RosBoolSensor extends RosSensor<Boolean, std_msgs.Bool> implements MessageListener<std_msgs.Bool> {

    private Logger logger = Logger.getLogger(RosBoolSensor.class);
    private Subscriber<std_msgs.Bool> subscriber;
    private BoundSynchronizedQueue<Boolean> queue;
    private Set<SensorListener<Boolean>> listeners = new HashSet<>();
    private GraphName nodeName;
    private String topic;
    private int bufferSize;

    /**
     * Constructs a new instance of this sensor for the given BTL type
     */
    public RosBoolSensor(Class<Boolean> typeClass, Class<std_msgs.Bool> rosType, GraphName nodeName) {
        super(Boolean.class, std_msgs.Bool.class);
        initialized = false;
        this.nodeName = nodeName;
    }

    @Override
    public void configure(IObjectConfigurator conf) throws ConfigurationException {
        this.topic = conf.requestValue("topic");
        this.bufferSize = conf.requestOptionalInt("bufferSize", 1);
    }


    /**
     * {@inheritDoc}
     */
    @Override
    public void addSensorListener(SensorListener<Boolean> listener) {
        listeners.add(listener);
        logger.fatal("added listener");
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public void removeSensorListener(SensorListener<Boolean> listener) {
        listeners.remove(listener);
    }

    @Override
    public void removeAllSensorListeners() {
        listeners.clear();
    }

    @Override
    public String getTarget() {
        return topic;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public Boolean readLast(long timeout) throws IOException, InterruptedException {
        return queue.nextCached(timeout);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public boolean hasNext() {
        return !queue.isEmpty();
    }

    @Override
    public void clear() {
        queue.clear();
    }

    @Override
    public void destroyNode() {
        if (subscriber != null) subscriber.shutdown();
    }

    //AbstractNode

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void onStart(ConnectedNode connectedNode) {
        logger.debug("connecting RosBoolSensor ...");
        queue = new BoundSynchronizedQueue<>(bufferSize);
        subscriber = connectedNode.newSubscriber(topic, std_msgs.Bool._TYPE);
        subscriber.addMessageListener(this);
        this.initialized = true;
    }


    //Message Handler
    @Override
    public void onNewMessage(std_msgs.Bool t) {
        logger.trace("received data: " + t.getData());
        queue.push(t.getData());
        listeners.forEach((SensorListener<Boolean> l) -> {
            l.newDataAvailable(t.getData());
        });
    }

}
