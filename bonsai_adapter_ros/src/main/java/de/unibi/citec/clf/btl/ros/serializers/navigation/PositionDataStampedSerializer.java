package de.unibi.citec.clf.btl.ros.serializers.navigation;


import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.TimeUnit;
import geometry_msgs.PoseStamped;
import org.ros.message.MessageFactory;

import javax.vecmath.Vector3d;


/**
 * @author lruegeme
 */
public class PositionDataStampedSerializer extends RosSerializer<PositionData, PoseStamped> {

    public PositionDataStampedSerializer() {
    }

    @Override
    public Class<PositionData> getDataType() {
        return PositionData.class;
    }

    @Override
    public Class<PoseStamped> getMessageType() {
        return PoseStamped.class;
    }

    @Override
    public PositionData deserialize(PoseStamped msg) throws DeserializationException {
        Pose3D pose = MsgTypeFactory.getInstance().createType(msg, Pose3D.class);

        double x, y, yaw;
        x = pose.getTranslation().getX(LengthUnit.METER);
        y = pose.getTranslation().getY(LengthUnit.METER);

        yaw = pose.getRotation().getYaw(AngleUnit.RADIAN);

        PositionData position = new PositionData(x, y, yaw, 0, LengthUnit.METER, AngleUnit.RADIAN, TimeUnit.MILLISECONDS);
        position.setFrameId(pose.getFrameId());
        return position;
    }

    @Override
    public PoseStamped serialize(PositionData data, MessageFactory fact) throws SerializationException {
        Pose3D pose = new Pose3D();
        pose.setFrameId(data.getFrameId());

        Point3D translation = new Point3D();
        translation.setX(data.getX(LengthUnit.METER), LengthUnit.METER);
        translation.setY(data.getY(LengthUnit.METER), LengthUnit.METER);
        translation.setZ(0, LengthUnit.METER);
        translation.setFrameId(data.getFrameId());
        pose.setTranslation(translation);

        Rotation3D rotation = new Rotation3D(new Vector3d(0, 0, 1), data.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
        rotation.setFrameId(data.getFrameId());
        pose.setRotation(rotation);

        return MsgTypeFactory.getInstance().createMsg(pose, PoseStamped._TYPE);
    }


}