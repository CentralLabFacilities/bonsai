package de.unibi.citec.clf.btl.ros.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import geometry_msgs.Point;
import geometry_msgs.Vector3;
import org.ros.message.MessageFactory;

/**
 * @author
 */
public class BoundingBoxSerializer extends RosSerializer<BoundingBox3D, vision_msgs.BoundingBox3D> {


    @Override
    public Class<vision_msgs.BoundingBox3D> getMessageType() {
        return vision_msgs.BoundingBox3D.class;
    }

    @Override
    public Class<BoundingBox3D> getDataType() {
        return BoundingBox3D.class;
    }

    @Override
    public vision_msgs.BoundingBox3D serialize(BoundingBox3D data, MessageFactory fact) throws SerializationException {
        vision_msgs.BoundingBox3D ret = fact.newFromType(vision_msgs.BoundingBox3D._TYPE);
        Vector3 size = ret.getSize();
        size.setX(data.getSize().getX(LengthUnit.METER));
        size.setY(data.getSize().getY(LengthUnit.METER));
        size.setZ(data.getSize().getZ(LengthUnit.METER));
        ret.setSize(size);
        return ret;
    }

    @Override
    public BoundingBox3D deserialize(vision_msgs.BoundingBox3D msg) throws DeserializationException {
        BoundingBox3D ret = new BoundingBox3D();
        ret.setSize(new Point3D(msg.getSize().getX(), msg.getSize().getY(), msg.getSize().getZ(), LengthUnit.METER));
        return ret;
    }

}
