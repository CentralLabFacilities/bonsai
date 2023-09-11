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
 * A simple {@link Sensor} for BTL based types that uses their static
 * <code>fromDocument</code> method to extract the data. This allows this sensor
 * to be used for every RSB-publisher that provides a BTL parseable result.
 *
 * @author lkettenb
 * @author jwienke
 */
public class RosStringSensor extends RosSensor<String, std_msgs.String> implements MessageListener<std_msgs.String> {

    private Logger logger = Logger.getLogger(RosStringSensor.class);
    private Subscriber<std_msgs.String> subscriber;
    private BoundSynchronizedQueue<String> queue;
    private Set<SensorListener<String>> listeners = new HashSet<>();
    private GraphName nodeName;
    private String topic;
    private int bufferSize;

    /**
     * Constructs a new instance of this sensor for the given BTL type
     */
    public RosStringSensor(Class<String> typeClass, Class<std_msgs.String> rosType, GraphName nodeName) {
        super(String.class, std_msgs.String.class);
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
    public void addSensorListener(SensorListener<String> listener) {
        listeners.add(listener);
        logger.fatal("added listener");
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public void removeSensorListener(SensorListener<String> listener) {
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
    public String readLast(long timeout) throws IOException, InterruptedException {
        logger.fatal("just debug: sensor read string ros");

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
        logger.debug("connecting RosStringSensor ...");
        queue = new BoundSynchronizedQueue<>(bufferSize);
        subscriber = connectedNode.newSubscriber(topic, std_msgs.String._TYPE);
        subscriber.addMessageListener(this);
        this.initialized = true;
    }


    //Message Handler
    @Override
    public void onNewMessage(std_msgs.String t) {
        logger.fatal("received data: " + t.getData());
        queue.push(t.getData());
        listeners.forEach((SensorListener<String> l) -> {
            l.newDataAvailable(t.getData());
        });
    }

}
