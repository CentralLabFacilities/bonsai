package de.unibi.citec.clf.btl.ros2;

import de.unibi.citec.clf.btl.StampedType;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.ros2.Ros2Serializer.DeserializationException;
import de.unibi.citec.clf.btl.units.TimeUnit;
import id.jros2messages.std_msgs.HeaderMessage;
import id.jrosmessages.Message;
import id.jrosmessages.primitives.Time;
import org.apache.log4j.Logger;

/**
 * @author
 */
public class MsgTypeFactory {

    private static Logger logger = Logger.getLogger(MsgTypeFactory.class);
    private static MsgTypeFactory inst;


    public static MsgTypeFactory getInstance() {
        if (inst == null) {
            inst = new MsgTypeFactory();
        }
        return inst;
    }

    /**
     * Singleton Pattern.
     */
    private MsgTypeFactory() {}

    /**
     * We can fetch faster if we know the type
     *
     * @param <T>
     * @param <M>
     * @param msg
     * @param dataType
     * @param msgType
     * @return
     * @throws DeserializationException
     */
    public <T extends Type, M extends Message> T createType(M msg, Class<T> dataType, String msgType)
            throws DeserializationException {

        Ros2Serializer<T, M> rosSerializer = (Ros2Serializer<T, M>) Ros2SerializerRepository.getMsgSerializer(dataType, msgType);

        if (rosSerializer != null) {
            return rosSerializer.deserialize(msg);
        } else {
            String error = "No serializer for data type "
                    + dataType.getSimpleName() + " found!";
            logger.error(error);
            throw new DeserializationException(error);
        }
    }

    public <T extends Type, M extends Message> T createType(M msg, Class<T> dataType)
            throws DeserializationException {
        logger.trace("create type: " + msg);
        Ros2Serializer<T, M> rosSerializer = null;
        //XXX
        //walk through interfaces as actual class is MessageImpl<msgtype> and i could not extract the type from that
        for (Class<?> c : msg.getClass().getInterfaces()) {
            //first interface should always be msgType
            rosSerializer = (Ros2Serializer<T, M>) Ros2SerializerRepository.getMsgSerializer(dataType, c.toString());
            if (rosSerializer != null) {
                break;
            }
        }

        if (rosSerializer != null) {
            return rosSerializer.deserialize(msg);
        } else {
            String error = "No serializer for data type "
                    + dataType.getSimpleName() + " found!";
            logger.error(error);
            throw new DeserializationException(error);
        }
    }

    public final <T extends Type, M extends Message> M createMsg(T data, Class<M> msgType)
            throws Ros2Serializer.SerializationException {

        @SuppressWarnings("unchecked")
        Class<T> dataType = (Class<T>) data.getClass();
        Ros2Serializer<T, M> ros3Serializer = Ros2SerializerRepository.getMsgSerializer(dataType, msgType);

        if (ros3Serializer != null) {
            return ros3Serializer.serialize(data);
        } else {
            String error = "No serializer for data type "
                    + dataType.getSimpleName() + " found!";
            logger.error(error);
            throw new Ros2Serializer.SerializationException(error);
        }

    }

    /**
     * @param <T>
     * @param <M>
     * @param data
     * @param msgType should be "Interface geometry_msg.Point"
     * @return
     * @throws Ros2Serializer.SerializationException
     */
    public final <T extends Type, M extends Message> M createMsg(T data, String msgType)
            throws Ros2Serializer.SerializationException {

        @SuppressWarnings("unchecked")
        Class<T> dataType = (Class<T>) data.getClass();
        Ros2Serializer<T, M> rosSerializer = Ros2SerializerRepository.getMsgSerializer(dataType, msgType);

        if (rosSerializer != null) {
            return rosSerializer.serialize(data);
        } else {
            String error = "No serializer for data type "
                    + dataType.getSimpleName() + " found!";
            logger.error(error);
            throw new Ros2Serializer.SerializationException(error);
        }

    }

    /**
     * Creates a new std_msgs.Header from the given BTL Type
     *
     * @param t the btl Type with Timestamp and FrameId
     * @return msg with Timestamp and FrameID
     */
    public HeaderMessage makeHeader(StampedType t) {
        HeaderMessage header = new HeaderMessage();
        header.frame_id = t.getFrameId();
        header.stamp = new Time((int)t.getTimestamp().getCreated(TimeUnit.SECONDS), 0);
        return header;
    }

    /**
     * Set FrameId and Timestamp of an BTL Type to the values of std_msgs.Header
     *
     * @param type   the type which fields are set
     * @param header header which fields are used
     * @return the type
     */
    public static Type setHeader(StampedType type, HeaderMessage header) {
        type.setFrameId(header.frame_id);
        type.setTimestamp(new Timestamp(header.stamp.sec,TimeUnit.SECONDS));
        return type;
    }
}
