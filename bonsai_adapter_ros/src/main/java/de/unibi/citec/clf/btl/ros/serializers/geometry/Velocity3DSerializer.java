package de.unibi.citec.clf.btl.ros.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Velocity3D;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.SpeedUnit;
import geometry_msgs.Vector3;
import org.ros.message.MessageFactory;

/**
 * @author saschroeder
 */
public class Velocity3DSerializer extends RosSerializer<Velocity3D, geometry_msgs.Vector3> {

    @Override
    public Class<geometry_msgs.Vector3> getMessageType() {
        return geometry_msgs.Vector3.class;
    }

    @Override
    public Class<Velocity3D> getDataType() {
        return Velocity3D.class;
    }

    @Override
    public geometry_msgs.Vector3 serialize(Velocity3D data, MessageFactory fact) throws SerializationException {
        geometry_msgs.Vector3 ret = fact.newFromType(geometry_msgs.Vector3._TYPE);
        ret.setX(data.getX(SpeedUnit.METER_PER_SEC));
        ret.setY(data.getY(SpeedUnit.METER_PER_SEC));
        ret.setZ(data.getZ(SpeedUnit.METER_PER_SEC));
        return ret;
    }

    @Override
    public Velocity3D deserialize(Vector3 msg) throws DeserializationException {
        Velocity3D ret = new Velocity3D();
        ret.setX(msg.getX(), SpeedUnit.METER_PER_SEC);
        ret.setY(msg.getY(), SpeedUnit.METER_PER_SEC);
        ret.setZ(msg.getZ(), SpeedUnit.METER_PER_SEC);
        return ret;
    }

}
