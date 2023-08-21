package de.unibi.citec.clf.bonsai.ros2.sensors;


import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.ros2.Ros2Sensor;
import de.unibi.citec.clf.bonsai.util.BoundSynchronizedQueue;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.ros2.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros2.Ros2Serializer;
import de.unibi.citec.clf.btl.ros2.Ros2SerializerRepository;
import id.jros2client.JRos2Client;
import id.jrosclient.TopicSubscriber;
import id.jrosmessages.Message;
import org.apache.log4j.Logger;
import java.io.IOException;
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
public class BtlMsgSensor<DataType extends Type, MsgType extends Message> extends Ros2Sensor<DataType, MsgType> {

    private final BoundSynchronizedQueue<DataType> queue;
    private Set<SensorListener<DataType>> listeners = new HashSet<>();
    private static final Logger logger = Logger.getLogger(BtlMsgSensor.class);
    private String topic;
    private int bufferSize;

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
    public BtlMsgSensor(Class<DataType> typeClass, Class<MsgType> rosType, JRos2Client client)
            throws IllegalArgumentException {
        super(typeClass, rosType, client);
        initialized = false;
        this.queue = new BoundSynchronizedQueue<>(bufferSize);

        if (Ros2SerializerRepository.getMsgSerializer(typeClass, rosType) == null) {
            throw new IllegalArgumentException("No btl ros2 msg serializer for type " + typeClass.getSimpleName());
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
                } catch (Ros2Serializer.DeserializationException e) {
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
    public void onStart() {
        try {
            client.subscribe(new TopicSubscriber<>(msgType, topic) {
                @Override
                public void onNext(MsgType s) {
                    final DataType data;
                    try {
                        data = MsgTypeFactory.getInstance().createType(s, dataTypeClass);
                    } catch (Ros2Serializer.DeserializationException e) {
                        throw new RuntimeException(e);
                    }
                    queue.push(data);
                    listeners.forEach((SensorListener<DataType> l) -> {
                        l.newDataAvailable(data);
                    });
                    // request next message
                    getSubscription().get().request(1);
                }
            });
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public void cleanUp() {
        client.close();
    }
}



