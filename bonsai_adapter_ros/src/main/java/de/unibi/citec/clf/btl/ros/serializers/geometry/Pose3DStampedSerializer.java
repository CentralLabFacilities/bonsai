package de.unibi.citec.clf.btl.ros.serializers.geometry;

import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.message.MessageFactory;

/**
 * @author lruegeme
 */
public class Pose3DStampedSerializer extends RosSerializer<Pose3D, geometry_msgs.PoseStamped> {

    @Override
    public Class<geometry_msgs.PoseStamped> getMessageType() {
        return geometry_msgs.PoseStamped.class;
    }

    @Override
    public Class<Pose3D> getDataType() {
        return Pose3D.class;
    }

    @Override
    public Pose3D deserialize(geometry_msgs.PoseStamped msg) throws DeserializationException {
        Pose3D ret = MsgTypeFactory.getInstance().createType(msg.getPose(), Pose3D.class);
        ret.setFrameId(msg.getHeader().getFrameId());
        return ret;
    }

    @Override
    public geometry_msgs.PoseStamped serialize(Pose3D data, MessageFactory fact) throws SerializationException {
        geometry_msgs.PoseStamped ps = fact.newFromType(geometry_msgs.PoseStamped._TYPE);
        geometry_msgs.Pose p = MsgTypeFactory.getInstance().createMsg(data, geometry_msgs.Pose._TYPE);
        ps.setPose(p);
        ps.setHeader(MsgTypeFactory.getInstance().makeHeader(data));
        return ps;
    }
}