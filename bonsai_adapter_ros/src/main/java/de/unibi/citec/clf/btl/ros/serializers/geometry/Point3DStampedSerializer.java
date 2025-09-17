package de.unibi.citec.clf.btl.ros.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Point2DStamped;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Point3DStamped;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import geometry_msgs.PointStamped;
import org.ros.message.MessageFactory;

/**
 * @author
 */
public class Point3DStampedSerializer extends RosSerializer<Point3DStamped, PointStamped> {

    @Override
    public Class<PointStamped> getMessageType() {
        return PointStamped.class;
    }

    @Override
    public Class<Point3DStamped> getDataType() {
        return Point3DStamped.class;
    }

    @Override
    public PointStamped serialize(Point3DStamped data, MessageFactory fact) throws SerializationException {
        PointStamped ret = fact.newFromType(PointStamped._TYPE);
        ret.setHeader(MsgTypeFactory.getInstance().makeHeader(data));
        ret.getPoint().setX(data.getX(LengthUnit.METER));
        ret.getPoint().setY(data.getY(LengthUnit.METER));
        ret.getPoint().setZ(data.getZ(LengthUnit.METER));
        return ret;
    }

    @Override
    public Point3DStamped deserialize(PointStamped msg) throws DeserializationException {
        Point3DStamped ret = new Point3DStamped((float) msg.getPoint().getX(), (float) msg.getPoint().getY(), (float) msg.getPoint().getZ(), LengthUnit.METER, msg.getHeader().getFrameId());
        ret.setFrameId(msg.getHeader().getFrameId());
        return ret;
    }

}
