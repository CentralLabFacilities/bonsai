package de.unibi.citec.clf.bonsai.ros.sensors;


import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.ros.RosSensor;
import de.unibi.citec.clf.bonsai.util.BoundSynchronizedQueue;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.ros.RosSerializerRepository;
import org.apache.log4j.Logger;
import org.ros.internal.message.Message;
import org.ros.message.MessageListener;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Subscriber;

import java.io.IOException;
import java.lang.reflect.Field;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * A simple {@link de.unibi.citec.clf.bonsai.core.object.Sensor} for Ros Msg types.
 *
 * @param <DataType> BTL type returned by this sensor
 * @param <MsgType>
 * @author lruegeme
 */
public class RosBtlMsgSensor<DataType extends Type, MsgType extends Message> extends RosSensor<DataType, MsgType> implements MessageListener<MsgType> {

    private final BoundSynchronizedQueue<DataType> queue;
    private Subscriber<MsgType> subscriber;
    private Set<SensorListener<DataType>> listeners = new HashSet<>();
    private static final Logger logger = Logger.getLogger(RosBtlMsgSensor.class);
    private String topic;
    private int bufferSize;
    private final GraphName nodeName;

    MsgType tMsg;
    private boolean keepLast;


    @Override
    public void configure(IObjectConfigurator conf) throws ConfigurationException {
        this.topic = conf.requestValue("topic");
        this.bufferSize = conf.requestOptionalInt("bufferSize", 1);
        this.keepLast = conf.requestOptionalBool("keepLast", false);
    }

    /**
     * Constructs a new instance of this sensor.
     *
     * @param typeClass type to return by this sensor.
     * @param rosType   type to subscribe by the ros subscriber
     * @throws IllegalArgumentException the given type does not contain a static fromDocument method.
     */
    public RosBtlMsgSensor(Class<DataType> typeClass, Class<MsgType> rosType, GraphName n)
            throws IllegalArgumentException {
        super(typeClass, rosType);
        initialized = false;
        this.queue = new BoundSynchronizedQueue<>(bufferSize);
        this.nodeName = n;

        if (RosSerializerRepository.getMsgSerializer(typeClass, rosType) == null) {
            throw new IllegalArgumentException("No btl ros msg serializer for type " + typeClass.getSimpleName());
        }
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public void addSensorListener(SensorListener<DataType> listener) {
        listeners.add(listener);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public void removeSensorListener(SensorListener<DataType> listener) {
        listeners.remove(listener);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public DataType readLast(long timeout) throws IOException, InterruptedException {
        DataType last;

        if (timeout == -1) {
            last = queue.front();
        } else if (keepLast) {
            last = queue.nextCached(timeout);
        } else {
            last = queue.next(timeout);
        }

        if (last == null) {
            if (keepLast) {
                try {
                    return MsgTypeFactory.getInstance().createType(tMsg, dataTypeClass);
                } catch (RosSerializer.DeserializationException e) {
                    logger.warn(e);
                }
            } else if (dataTypeClass.isAssignableFrom(List.class)) {
                try {
                    return dataTypeClass.newInstance();
                } catch (InstantiationException | IllegalAccessException ex) {
                    logger.error(ex.getMessage(), ex);
                }
            }
        }

        return last;
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
    public void removeAllSensorListeners() {
        listeners.clear();
    }

    @Override
    public void destroyNode() {
        if (subscriber != null) subscriber.shutdown();
    }

    @Override
    public void onStart(ConnectedNode connectedNode) {
        logger.debug("connecting RosBtlMsgSensor ...");

        try {
            Field typeField = msgType.getDeclaredField("_TYPE");
            String type = (String) typeField.get(null);
            logger.info("subscribed to: " + topic + " (" + type + ")");
            subscriber = connectedNode.newSubscriber(topic, type);
            subscriber.addMessageListener(this);
            initialized = true;
        } catch (NoSuchFieldException | SecurityException | IllegalArgumentException | IllegalAccessException ex) {
            //TODO catch exception?
            throw new RuntimeException(ex);
        }

        if (subscriber.getLatchMode() != keepLast) {
            logger.warn("sensor is latched:" + subscriber.getLatchMode() + " but keepLast option is:" + keepLast);
        }

    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void onNewMessage(MsgType t) {
        if (keepLast) {
            tMsg = t;
        }


        try {
            final DataType data = MsgTypeFactory.getInstance().createType(t, dataTypeClass);
            queue.push(data);

            listeners.forEach((SensorListener<DataType> l) -> {
                l.newDataAvailable(data);
            });

        } catch (Exception e) {
            logger.fatal("Error converting ros msg to btl.");
            logger.debug("Error converting ros msg to btl", e);
        }

    }
}
