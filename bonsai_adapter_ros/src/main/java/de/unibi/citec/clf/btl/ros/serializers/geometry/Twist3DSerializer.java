package de.unibi.citec.clf.btl.ros.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Velocity3D;
import de.unibi.citec.clf.btl.data.geometry.Twist3D;
import de.unibi.citec.clf.btl.data.geometry.AngularVelocity3D;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import geometry_msgs.Twist;
import geometry_msgs.Vector3;
import org.ros.message.MessageFactory;

/**
 * @author saschroeder
 */
public class Twist3DSerializer extends RosSerializer<Twist3D, geometry_msgs.Twist> {

    @Override
    public Class<geometry_msgs.Twist> getMessageType() {
        return geometry_msgs.Twist.class;
    }

    @Override
    public Class<Twist3D> getDataType() {
        return Twist3D.class;
    }

    @Override
    public Twist3D deserialize(geometry_msgs.Twist msg) throws DeserializationException {
        Twist3D ret = new Twist3D();
        ret.setAngular(MsgTypeFactory.getInstance().createType(msg.getAngular(), AngularVelocity3D.class));
        ret.setLinear(MsgTypeFactory.getInstance().createType(msg.getLinear(), Velocity3D.class));
        return ret;
    }

    @Override
    public Twist serialize(Twist3D data, MessageFactory fact) throws SerializationException {
        Twist twist = fact.newFromType(Twist._TYPE);
        twist.setAngular(MsgTypeFactory.getInstance().createMsg(data.getAngular(), geometry_msgs.Vector3.class));
        twist.setLinear(MsgTypeFactory.getInstance().createMsg(data.getLinear(), geometry_msgs.Vector3.class));
        return twist;
    }
}