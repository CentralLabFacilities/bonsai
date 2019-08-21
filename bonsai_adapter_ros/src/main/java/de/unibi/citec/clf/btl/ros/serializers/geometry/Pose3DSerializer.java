package de.unibi.citec.clf.btl.ros.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import geometry_msgs.Pose;
import org.ros.message.MessageFactory;

/**
 * @author
 */
public class Pose3DSerializer extends RosSerializer<Pose3D, geometry_msgs.Pose> {

    @Override
    public Class<geometry_msgs.Pose> getMessageType() {
        return geometry_msgs.Pose.class;
    }

    @Override
    public Class<Pose3D> getDataType() {
        return Pose3D.class;
    }

    @Override
    public Pose3D deserialize(geometry_msgs.Pose msg) throws DeserializationException {
        Pose3D ret = new Pose3D();
        ret.setRotation(MsgTypeFactory.getInstance().createType(msg.getOrientation(), Rotation3D.class));
        ret.setTranslation(MsgTypeFactory.getInstance().createType(msg.getPosition(), Point3D.class));
        return ret;
    }

    @Override
    public Pose serialize(Pose3D data, MessageFactory fact) throws SerializationException {
        Pose pose = fact.newFromType(Pose._TYPE);
        pose.setOrientation(MsgTypeFactory.getInstance().createMsg(data.getRotation(), geometry_msgs.Quaternion.class));
        pose.setPosition(MsgTypeFactory.getInstance().createMsg(data.getTranslation(), geometry_msgs.Point.class));
        return pose;
    }
}