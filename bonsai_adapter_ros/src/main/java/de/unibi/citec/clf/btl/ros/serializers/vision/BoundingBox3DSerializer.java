package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import org.ros.message.MessageFactory;

/**
 * @author lruegeme
 */
public class BoundingBox3DSerializer extends RosSerializer<BoundingBox3D, vision_msgs.BoundingBox3D> {

    @Override
    public vision_msgs.BoundingBox3D serialize(BoundingBox3D data, MessageFactory fact) throws SerializationException {
        vision_msgs.BoundingBox3D msg = fact.newFromType(vision_msgs.BoundingBox3D._TYPE);

        msg.setCenter(MsgTypeFactory.getInstance().createMsg(data.getPose(),geometry_msgs.Pose._TYPE));
        msg.getSize().setX(data.getSize().getX(LengthUnit.METER));
        msg.getSize().setY(data.getSize().getY(LengthUnit.METER));
        msg.getSize().setZ(data.getSize().getZ(LengthUnit.METER));

        return msg;
    }

    @Override
    public BoundingBox3D deserialize(vision_msgs.BoundingBox3D msg) throws DeserializationException {
        BoundingBox3D data = new BoundingBox3D();

        data.setPose(MsgTypeFactory.getInstance().createType(msg.getCenter(),Pose3D.class));
        data.setSize(new Point3D(msg.getSize().getX(),msg.getSize().getY(),msg.getSize().getZ(),LengthUnit.METER));

        return data;
    }

    @Override
    public Class<vision_msgs.BoundingBox3D> getMessageType() {
        return vision_msgs.BoundingBox3D.class;
    }

    @Override
    public Class<BoundingBox3D> getDataType() {
        return BoundingBox3D.class;
    }

}
