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
import geometry_msgs.Pose;
import geometry_msgs.PoseWithCovariance;
import geometry_msgs.PoseWithCovarianceStamped;
import org.ros.message.MessageFactory;

import javax.vecmath.Vector3d;


/**
 * @author lruegeme
 */
public class PoseWithCovarianceStampedSerializer extends RosSerializer<Pose2D, PoseWithCovarianceStamped> {
    private static org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(PoseWithCovarianceStampedSerializer.class);

    @Override
    public Class<Pose2D> getDataType() {
        return Pose2D.class;
    }

    @Override
    public Class<PoseWithCovarianceStamped> getMessageType() {
        return PoseWithCovarianceStamped.class;
    }

    @Override
    public Pose2D deserialize(PoseWithCovarianceStamped msg) throws DeserializationException {
        Pose3D pose = MsgTypeFactory.getInstance().createType(msg.getPose().getPose(), Pose3D.class);
        logger.info("pose: " + pose.getRotation().toString());
        double x, y, yaw;
        x = pose.getTranslation().getX(LengthUnit.METER);
        y = pose.getTranslation().getY(LengthUnit.METER);

        yaw = pose.getRotation().getYaw(AngleUnit.RADIAN);

        Pose2D position = new Pose2D(x, y, yaw, 0, LengthUnit.METER, AngleUnit.RADIAN, TimeUnit.MILLISECONDS);
        position.setFrameId(msg.getHeader().getFrameId());

        return position;
    }

    @Override
    public PoseWithCovarianceStamped serialize(Pose2D data, MessageFactory fact) throws SerializationException {
        PoseWithCovarianceStamped pwcs = fact.newFromType(PoseWithCovarianceStamped._TYPE);
        PoseWithCovariance pwc = fact.newFromType(PoseWithCovariance._TYPE);


        Pose3D pose = new Pose3D();
        pose.setFrameId(data.getFrameId());

        Point3D translation = new Point3D();
        translation.setX(data.getX(LengthUnit.METER), LengthUnit.METER);
        translation.setY(data.getY(LengthUnit.METER), LengthUnit.METER);
        translation.setZ(0, LengthUnit.METER);
        pose.setTranslation(translation);

        Rotation3D rotation = new Rotation3D(new Vector3d(0, 0, 1), data.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
        pose.setRotation(rotation);

        pwc.setPose(MsgTypeFactory.getInstance().createMsg(pose, Pose._TYPE));
        pwcs.setPose(pwc);

        return pwcs;
    }


}