package de.unibi.citec.clf.btl.ros.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import geometry_msgs.Point;
import geometry_msgs.PointStamped;
import org.ros.message.MessageFactory;

/**
 * @author
 */
public class Point3DStampedSerializer extends RosSerializer<Point3D, PointStamped> {

    @Override
    public Class<PointStamped> getMessageType() {
        return PointStamped.class;
    }

    @Override
    public Class<Point3D> getDataType() {
        return Point3D.class;
    }

    @Override
    public PointStamped serialize(Point3D data, MessageFactory fact) throws SerializationException {
        PointStamped ret = fact.newFromType(PointStamped._TYPE);
        MsgTypeFactory.setHeader(data,ret.getHeader());
        ret.getPoint().setX(data.getX(LengthUnit.METER));
        ret.getPoint().setY(data.getY(LengthUnit.METER));
        ret.getPoint().setZ(data.getZ(LengthUnit.METER));
        return ret;
    }

    @Override
    public Point3D deserialize(PointStamped msg) throws DeserializationException {
        Point3D ret = new Point3D();
        ret.setX(msg.getPoint().getX(), LengthUnit.METER);
        ret.setY(msg.getPoint().getY(), LengthUnit.METER);
        ret.setZ(msg.getPoint().getZ(), LengthUnit.METER);
        ret.setFrameId(msg.getHeader().getFrameId());
        return ret;
    }

}
