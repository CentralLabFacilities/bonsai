package de.unibi.citec.clf.bonsai.ros.sensors;


import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.ros.RosSensor;
import de.unibi.citec.clf.bonsai.util.BoundSynchronizedQueue;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.units.TimeUnit;
import org.apache.log4j.Logger;
import org.ros.message.MessageListener;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Subscriber;

import java.io.IOException;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.Set;

/**
 * A rather simple {@link Sensor} for Doubles.
 *
 * @author rfeldhans
 */
public class RosDoubleSensor extends RosSensor<Double, std_msgs.Float64> implements MessageListener<std_msgs.Float64> {

    private Logger logger = Logger.getLogger(RosDoubleSensor.class);
    private Subscriber<std_msgs.Float64> subscriber;
    private BoundSynchronizedQueue<Double> queue;
    private LinkedList<Timestamp> times;
    private Set<SensorListener<Double>> listeners = new HashSet<>();
    private GraphName nodeName;
    private String topic;
    private int bufferSize;

    /**
     * Constructs a new instance of this sensor.
     */
    public RosDoubleSensor(Class<Double> typeClass, Class<std_msgs.Float64> rosType, GraphName nodeName) throws IllegalArgumentException {
        super(Double.class, std_msgs.Float64.class);
        initialized = false;
        times = new LinkedList();
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
    public void addSensorListener(SensorListener<Double> listener) {
        listeners.add(listener);
        logger.fatal("added listener");
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public void removeSensorListener(SensorListener<Double> listener) {
        listeners.remove(listener);
    }

    @Override
    public void removeAllSensorListeners() {
        listeners.clear();
    }

    /**
     * Get the last few messages. Amount of messages and their oldness can be specified.
     *
     * @param amount the maximum size of the list this function returns.
     * @param millis the time in milliseconds the messages may be old. Set to 0 to ignore the time.
     * @return a list of the last few received messages
     */
    public LinkedList<Double> getLast(int amount, long millis) {
        LinkedList<Double> ret = new LinkedList();
        LinkedList<Double> all = queue.getAllElements();
        Timestamp now = new Timestamp();
        for (int i = 0; i < amount && i < times.size(); i++) {
            if (millis == 0 ||
                    times.get(times.size() - 1 - i).getCreated(TimeUnit.MILLISECONDS) >= now.getCreated(TimeUnit.MILLISECONDS) - millis) {
                ret.add(all.removeLast());

            }
        }


        return ret;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public Double readLast(long timeout) throws IOException, InterruptedException {
        logger.fatal("just debug: sensor read double ros");

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
        times.clear();
    }

    @Override
    public void destroyNode() {
        logger.fatal("CLEANUP CALLED");
        subscriber.shutdown();
    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void onStart(ConnectedNode connectedNode) {
        logger.debug("connecting RosDoubleSensor ...");
        queue = new BoundSynchronizedQueue<>(bufferSize);
        subscriber = connectedNode.newSubscriber(topic, std_msgs.Float64._TYPE);
        subscriber.addMessageListener(this);
        this.initialized = true;
    }

    //Message Handler
    @Override
    public void onNewMessage(std_msgs.Float64 t) {
        queue.push(t.getData());
        times.add(new Timestamp());

        listeners.forEach((SensorListener<Double> l) -> {
            l.newDataAvailable(t.getData());
        });
    }

    @Override
    public String getTarget() {
        return topic;
    }

}
