package de.unibi.citec.clf.btl.ros2.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.ros2.Ros2Serializer;
import id.jrosmessages.geometry_msgs.QuaternionMessage;
import javax.vecmath.Quat4d;


/**
 * @author lruegeme
 */
public class Rotation3DSerializer extends Ros2Serializer<Rotation3D, QuaternionMessage> {


    @Override
    public Class<QuaternionMessage> getMessageType() {
        return QuaternionMessage.class;
    }

    @Override
    public Class<Rotation3D> getDataType() {
        return Rotation3D.class;
    }

    @Override
    public QuaternionMessage serialize(Rotation3D data) {
        QuaternionMessage ret = new QuaternionMessage();

        Quat4d quat = data.getQuaternion();
        ret.w = (quat.w);
        ret.x = (quat.x);
        ret.y = (quat.y);
        ret.z = (quat.z);
        return ret;
    }

    @Override
    public Rotation3D deserialize(QuaternionMessage msg) {
        Quat4d quat = new Quat4d(msg.x, msg.y, msg.z, msg.w);
        Rotation3D rot = new Rotation3D(quat);
        return rot;
    }

}
