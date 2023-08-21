package de.unibi.citec.clf.btl.ros2.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.ros2.Ros2Serializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import id.jrosmessages.geometry_msgs.PointMessage;

/**
 * @author
 */
public class Point3DSerializer extends Ros2Serializer<Point3D, PointMessage> {

    @Override
    public Class<PointMessage> getMessageType() {
        return PointMessage.class;
    }

    @Override
    public Class<Point3D> getDataType() {
        return Point3D.class;
    }

    @Override
    public PointMessage serialize(Point3D data) throws SerializationException {
        PointMessage ret = new PointMessage();
        ret.x = data.getX(LengthUnit.METER);
        ret.y = data.getY(LengthUnit.METER);
        ret.z = data.getZ(LengthUnit.METER);
        return ret;
    }

    @Override
    public Point3D deserialize(PointMessage msg) throws DeserializationException {
        Point3D ret = new Point3D();
        ret.setX(msg.x, LengthUnit.METER);
        ret.setY(msg.y, LengthUnit.METER);
        ret.setZ(msg.z, LengthUnit.METER);
        return ret;
    }

}
