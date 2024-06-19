package de.unibi.citec.clf.btl.ros;

import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.ros.RosSerializer.DeserializationException;
import de.unibi.citec.clf.btl.ros.RosSerializer.SerializationException;
import de.unibi.citec.clf.btl.units.TimeUnit;
import org.apache.log4j.Logger;
import org.ros.concurrent.DefaultScheduledExecutorService;
import org.ros.internal.message.Message;
import org.ros.message.Time;
import org.ros.namespace.GraphName;
import org.ros.node.*;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedList;

/**
 * @author
 */
public class MsgTypeFactory {

    private static Logger logger = Logger.getLogger(MsgTypeFactory.class);
    private static MsgTypeFactory inst;
    private Node node;

    public static MsgTypeFactory getInstance() {
        if (inst == null) {
            inst = new MsgTypeFactory();
        }
        return inst;
    }

    /**
     * Singleton Pattern.
     */
    private MsgTypeFactory() {
        NodeFactory factory = new DefaultNodeFactory(new DefaultScheduledExecutorService());

        String local = System.getenv("ROS_IP");
        if (local == null || local.isEmpty()) {
            logger.warn("ROS_IP not set");
            local = "127.0.0.1";
        }

        String master = System.getenv("ROS_MASTER_URI");
        if (master == null || master.isEmpty()) {
            logger.warn("ROS_MASTER_URI not set");
            master = "http://localhost:11311/";
        }

        logger.debug("running MsgTypeFactory on: " + local + " , master: " + master);
        URI rosMasterUri;
        try {
            rosMasterUri = new URI(master);
        } catch (URISyntaxException e) {
            logger.fatal(e);
            throw new RuntimeException(e);
        }
        logger.info("using ros master: " + rosMasterUri);
        NodeConfiguration c = NodeConfiguration.newPublic(local, rosMasterUri);
        c.setNodeName(GraphName.newAnonymous());
        node = factory.newNode(c, new LinkedList<NodeListener>());
    }

    /**
     * We can fetch faster if we know the type
     *
     * @param <T>
     * @param <M>
     * @param msg
     * @param dataType
     * @param msgType
     * @return
     * @throws de.unibi.citec.clf.btl.ros.RosSerializer.DeserializationException
     */
    public <T extends Type, M extends Message> T createType(M msg, Class<T> dataType, String msgType)
            throws DeserializationException {

        RosSerializer<T, M> rosSerializer = (RosSerializer<T, M>) RosSerializerRepository.getMsgSerializer(dataType, msgType);

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
        RosSerializer<T, M> rosSerializer = null;
        //XXX
        //walk through interfaces as actual class is MessageImpl<msgtype> and i could not extract the type from that
        for (Class<?> c : msg.getClass().getInterfaces()) {
            //first interface should always be msgType
            rosSerializer = (RosSerializer<T, M>) RosSerializerRepository.getMsgSerializer(dataType, c.toString());
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
            throws SerializationException {

        @SuppressWarnings("unchecked")
        Class<T> dataType = (Class<T>) data.getClass();
        RosSerializer<T, M> rosSerializer = RosSerializerRepository.getMsgSerializer(dataType, msgType);

        if (rosSerializer != null) {
            return rosSerializer.serialize(data, node.getTopicMessageFactory());
        } else {
            String error = "No serializer for data type "
                    + dataType.getSimpleName() + " found!";
            logger.error(error);
            throw new SerializationException(error);
        }

    }

    /**
     * @param <T>
     * @param <M>
     * @param data
     * @param msgType should be "Interface geometry_msg.Point"
     * @return
     * @throws de.unibi.citec.clf.btl.ros.RosSerializer.SerializationException
     */
    public final <T extends Type, M extends Message> M createMsg(T data, String msgType)
            throws SerializationException {

        @SuppressWarnings("unchecked")
        Class<T> dataType = (Class<T>) data.getClass();
        RosSerializer<T, M> rosSerializer = RosSerializerRepository.getMsgSerializer(dataType, msgType);

        if (rosSerializer != null) {
            return rosSerializer.serialize(data, node.getTopicMessageFactory());
        } else {
            String error = "No serializer for data type '"
                    + dataType + "' and MsgType '" + msgType + "' found!";
            logger.error(error);
            throw new SerializationException(error);
        }

    }

    /**
     * Create a new MSG of the given Type.
     *
     * @param type the Type in string representation (msg._TYPE)
     * @param <T>  the Type of the Message
     * @return a new Message of the given Type
     */
    public <T extends Message> T newMessage(String type) {
        return node.getTopicMessageFactory().newFromType(type);
    }

    /**
     * Creates a new std_msgs.Header from the given BTL Type
     *
     * @param t the btl Type with Timestamp and FrameId
     * @return msg with Timestamp and FrameID
     */
    public std_msgs.Header makeHeader(Type t) {
        std_msgs.Header header = newMessage(std_msgs.Header._TYPE);
        header.setFrameId(t.getFrameId());
        header.setStamp(fromTimestamp(t.getTimestamp()));
        return header;
    }

    /**
     * Set FrameId and Timestamp of an BTL Type to the values of std_msgs.Header
     *
     * @param type   the type which fields are set
     * @param header header which fields are used
     * @return the type
     */
    public static Type setHeader(Type type, std_msgs.Header header) {
        type.setFrameId(header.getFrameId());
        type.setTimestamp(fromTime(header.getStamp()));
        return type;
    }

    public static Time fromTimestamp(Timestamp stamp) {
        int sec = (int) stamp.getCreated(TimeUnit.SECONDS);
        int nsec = (int) stamp.getCreated(TimeUnit.NANOSECONDS);
        return new Time(sec, nsec);
    }

    public static Timestamp fromTime(Time time) {
        long msec = time.secs / 1000L;
        msec += time.nsecs * 1000L;
        return new Timestamp(msec, TimeUnit.MILLISECONDS);
    }
}
