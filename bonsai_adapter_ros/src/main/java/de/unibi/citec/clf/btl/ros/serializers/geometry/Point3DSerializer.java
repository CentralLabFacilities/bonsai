package de.unibi.citec.clf.btl.ros.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import geometry_msgs.Point;
import org.ros.message.MessageFactory;

/**
 * @author
 */
public class Point3DSerializer extends RosSerializer<Point3D, geometry_msgs.Point> {

    @Override
    public Class<geometry_msgs.Point> getMessageType() {
        return geometry_msgs.Point.class;
    }

    @Override
    public Class<Point3D> getDataType() {
        return Point3D.class;
    }

    @Override
    public geometry_msgs.Point serialize(Point3D data, MessageFactory fact) throws SerializationException {
        geometry_msgs.Point ret = fact.newFromType(geometry_msgs.Point._TYPE);
        ret.setX(data.getX(LengthUnit.METER));
        ret.setY(data.getY(LengthUnit.METER));
        ret.setZ(data.getZ(LengthUnit.METER));
        return ret;
    }

    @Override
    public Point3D deserialize(Point msg) throws DeserializationException {
        Point3D ret = new Point3D();
        ret.setX(msg.getX(), LengthUnit.METER);
        ret.setY(msg.getY(), LengthUnit.METER);
        ret.setZ(msg.getZ(), LengthUnit.METER);
        return ret;
    }

}
