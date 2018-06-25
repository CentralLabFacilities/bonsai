package de.unibi.citec.clf.btl.ros.serializers.navigation;


import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.TimeUnit;
import org.ros.message.MessageFactory;


/**
 * @author kkonen
 * @author rfeldhans
 */
public class OdometrySerializer extends RosSerializer<PositionData, nav_msgs.Odometry> {

    @Override
    public Class<PositionData> getDataType() {
        return PositionData.class;
    }

    @Override
    public Class<nav_msgs.Odometry> getMessageType() {
        return nav_msgs.Odometry.class;
    }

    @Override
    public PositionData deserialize(nav_msgs.Odometry msg) throws RosSerializer.DeserializationException {
        Pose3D pose = MsgTypeFactory.getInstance().createType(msg.getPose().getPose(), Pose3D.class);

        double x = pose.getTranslation().getX(LengthUnit.METER);
        double y = pose.getTranslation().getY(LengthUnit.METER);
        double yaw = pose.getRotation().getYaw(AngleUnit.RADIAN);

        PositionData position = new PositionData(x, y, yaw, 0, LengthUnit.METER, AngleUnit.RADIAN, TimeUnit.MILLISECONDS);
        position.setFrameId("map");
        return position;
    }

    @Override
    public nav_msgs.Odometry serialize(PositionData data, MessageFactory fact) throws RosSerializer.SerializationException {
        geometry_msgs.Pose pose = MsgTypeFactory.getInstance().createMsg(data, geometry_msgs.Pose._TYPE);

        nav_msgs.Odometry odom = fact.newFromType(nav_msgs.Odometry._TYPE);
        odom.getPose().setPose(pose);

        odom.setHeader(MsgTypeFactory.getInstance().makeHeader(data));

        return odom;
    }


}