package de.unibi.citec.clf.btl.ros2.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.ros2.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros2.Ros2Serializer;
import id.jrosmessages.geometry_msgs.PointMessage;
import id.jrosmessages.geometry_msgs.PoseMessage;
import id.jrosmessages.geometry_msgs.QuaternionMessage;

/**
 * @author
 */
public class Pose3DSerializer extends Ros2Serializer<Pose3D, PoseMessage> {

    @Override
    public Class<PoseMessage> getMessageType() {
        return PoseMessage.class;
    }

    @Override
    public Class<Pose3D> getDataType() {
        return Pose3D.class;
    }

    @Override
    public Pose3D deserialize(PoseMessage msg) throws DeserializationException {
        Pose3D ret = new Pose3D();
        ret.setRotation(MsgTypeFactory.getInstance().createType(msg.orientation, Rotation3D.class));
        ret.setTranslation(MsgTypeFactory.getInstance().createType(msg.position, Point3D.class));
        return ret;
    }

    @Override
    public PoseMessage serialize(Pose3D data) throws SerializationException {
        PoseMessage pose = new PoseMessage();
        pose.orientation = MsgTypeFactory.getInstance().createMsg(data.getRotation(), QuaternionMessage.class);
        pose.position = MsgTypeFactory.getInstance().createMsg(data.getTranslation(), PointMessage.class);
        return pose;
    }
}