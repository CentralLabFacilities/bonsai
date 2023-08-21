package de.unibi.citec.clf.btl.ros2.serializers.geometry;

import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.ros2.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros2.Ros2Serializer;
import id.jros2messages.geometry_msgs.PoseStampedMessage;
import id.jrosmessages.geometry_msgs.PoseMessage;

/**
 * @author lruegeme
 */
public class Pose3DStampedSerializer extends Ros2Serializer<Pose3D, PoseStampedMessage> {

    @Override
    public Class<PoseStampedMessage> getMessageType() {
        return PoseStampedMessage.class;
    }

    @Override
    public Class<Pose3D> getDataType() {
        return Pose3D.class;
    }

    @Override
    public Pose3D deserialize(PoseStampedMessage msg) throws DeserializationException {
        Pose3D ret = MsgTypeFactory.getInstance().createType(msg.pose, Pose3D.class);
        MsgTypeFactory.setHeader(ret,msg.header);
        return ret;
    }

    @Override
    public PoseStampedMessage serialize(Pose3D data) throws SerializationException {
        PoseStampedMessage ps = new PoseStampedMessage();
        ps.pose = MsgTypeFactory.getInstance().createMsg(data, PoseMessage.class);
        ps.header = MsgTypeFactory.getInstance().makeHeader(data);
        return ps;
    }
}