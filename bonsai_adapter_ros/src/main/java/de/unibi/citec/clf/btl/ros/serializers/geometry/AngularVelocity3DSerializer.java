package de.unibi.citec.clf.btl.ros.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.AngularVelocity3D;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import geometry_msgs.Vector3;
import org.ros.message.MessageFactory;

/**
 * @author saschroeder
 */
public class AngularVelocity3DSerializer extends RosSerializer<AngularVelocity3D, geometry_msgs.Vector3> {

    @Override
    public Class<geometry_msgs.Vector3> getMessageType() {
        return geometry_msgs.Vector3.class;
    }

    @Override
    public Class<AngularVelocity3D> getDataType() {
        return AngularVelocity3D.class;
    }

    @Override
    public geometry_msgs.Vector3 serialize(AngularVelocity3D data, MessageFactory fact) throws SerializationException {
        geometry_msgs.Vector3 ret = fact.newFromType(geometry_msgs.Vector3._TYPE);
        ret.setX(data.getX(RotationalSpeedUnit.RADIANS_PER_SEC));
        ret.setY(data.getY(RotationalSpeedUnit.RADIANS_PER_SEC));
        ret.setZ(data.getZ(RotationalSpeedUnit.RADIANS_PER_SEC));
        return ret;
    }

    @Override
    public AngularVelocity3D deserialize(Vector3 msg) throws DeserializationException {
        AngularVelocity3D ret = new AngularVelocity3D();
        ret.setX(msg.getX(), RotationalSpeedUnit.RADIANS_PER_SEC);
        ret.setY(msg.getY(), RotationalSpeedUnit.RADIANS_PER_SEC);
        ret.setZ(msg.getZ(), RotationalSpeedUnit.RADIANS_PER_SEC);
        return ret;
    }

}
