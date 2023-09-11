package de.unibi.citec.clf.bonsai.ros2.sensors;


import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.ros2.Ros2Sensor;
import de.unibi.citec.clf.bonsai.util.BoundSynchronizedQueue;
import id.jros2client.JRos2Client;
import id.jros2client.JRos2ClientFactory;
import id.jrosclient.TopicSubscriber;
import org.apache.log4j.Logger;
import id.jrosmessages.std_msgs.StringMessage;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

/**
 * @author lruegeme
 */
public class StringSensor extends Ros2Sensor<String, StringMessage>  {

    private Logger logger = Logger.getLogger(StringSensor.class);
    private BoundSynchronizedQueue<String> queue;
    private Set<SensorListener<String>> listeners = new HashSet<>();
    private String topic;
    private int bufferSize;

    /**
     * Constructs a new instance of this sensor for the given BTL type
     */
    public StringSensor(Class<String> typeClass, Class<StringMessage> rosType, JRos2Client client) {
        super(String.class, StringMessage.class, client);
        initialized = false;

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
        logger.info("just debug: sensor read string ros2");
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
    public void onStart() {
        queue = new BoundSynchronizedQueue<>(bufferSize);

        try {
            client.subscribe(new TopicSubscriber<>(StringMessage.class, topic) {
                @Override
                public void onNext(StringMessage s) {
                    logger.info("received data: " + s.data);
                    queue.push(s.data);

                    listeners.forEach((SensorListener<String> l) -> {
                        l.newDataAvailable(s.data);
                    });

                    // request next message
                    getSubscription().get().request(1);
                }
            });
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        this.initialized = true;
    }

    @Override
    public void cleanUp() {
        client.close();
    }
}
