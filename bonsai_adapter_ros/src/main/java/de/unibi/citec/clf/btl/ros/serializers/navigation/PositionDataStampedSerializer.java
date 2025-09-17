package de.unibi.citec.clf.btl.ros.serializers.navigation;


import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
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
public class PositionDataStampedSerializer extends RosSerializer<Pose2D, PoseStamped> {

    public PositionDataStampedSerializer() {
    }

    @Override
    public Class<Pose2D> getDataType() {
        return Pose2D.class;
    }

    @Override
    public Class<PoseStamped> getMessageType() {
        return PoseStamped.class;
    }

    @Override
    public Pose2D deserialize(PoseStamped msg) throws DeserializationException {
        Pose3D pose = MsgTypeFactory.getInstance().createType(msg, Pose3D.class);

        double x, y, yaw;
        x = pose.getTranslation().getX(LengthUnit.METER);
        y = pose.getTranslation().getY(LengthUnit.METER);

        yaw = pose.getRotation().getYaw(AngleUnit.RADIAN);

        Pose2D position = new Pose2D(x, y, yaw, 0, LengthUnit.METER, AngleUnit.RADIAN, TimeUnit.MILLISECONDS);
        position.setFrameId(pose.getFrameId());
        return position;
    }

    @Override
    public PoseStamped serialize(Pose2D data, MessageFactory fact) throws SerializationException {
        Pose3D pose = new Pose3D();
        pose.setFrameId(data.getFrameId());

        Point3D translation = new Point3D();
        translation.setX(data.getX(LengthUnit.METER), LengthUnit.METER);
        translation.setY(data.getY(LengthUnit.METER), LengthUnit.METER);
        translation.setZ(0, LengthUnit.METER);
        pose.setTranslation(translation);

        Rotation3D rotation = new Rotation3D(new Vector3d(0, 0, 1), data.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
        pose.setRotation(rotation);

        return MsgTypeFactory.getInstance().createMsg(pose, PoseStamped._TYPE);
    }


}