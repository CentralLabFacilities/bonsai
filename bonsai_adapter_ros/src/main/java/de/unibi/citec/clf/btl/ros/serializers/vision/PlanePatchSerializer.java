package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatch;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import geometry_msgs.Point;
import geometry_msgs.Pose;
import geometry_msgs.Quaternion;
import grasping_msgs.Object;
import org.ros.message.MessageFactory;
import shape_msgs.SolidPrimitive;

import javax.vecmath.Quat4d;

/**
 * @author ffriese
 */
public class PlanePatchSerializer extends RosSerializer<PlanePatch, Object> {

    @Override
    public Object serialize(PlanePatch data, MessageFactory fact) throws SerializationException {
        throw new UnsupportedOperationException();
    }

    @Override
    public PlanePatch deserialize(Object msg) throws DeserializationException {


        Pose msg_pose = msg.getPrimitivePoses().get(0);
        SolidPrimitive msg_primitive = msg.getPrimitives().get(0);


        if (msg_primitive.getType() != SolidPrimitive.BOX) {
            throw new DeserializationException("ERROR, NON BOX PRIMITIVE CANNOT BE DESERIALIZED TO PLANE");
        }

        PlanePatch patch = new PlanePatch();

        double[] dims = msg_primitive.getDimensions();
        double x_w = dims[0];
        double y_w = dims[1];
        double height = dims[2];

        Point pos = msg_pose.getPosition();
        Quaternion q = msg_pose.getOrientation();
        Pose3D pose = new Pose3D();
        pose.setTranslation(new Point3D(pos.getX(), pos.getY(), pos.getZ() + height, LengthUnit.METER));
        pose.setRotation(new Rotation3D(new Quat4d(q.getX(), q.getY(), q.getZ(), q.getW())));
        patch.setBase(pose);

        PrecisePolygon poly = new PrecisePolygon();

        poly.addPoint(pos.getX() - (x_w / 2), pos.getY() - (y_w / 2), LengthUnit.METER);
        poly.addPoint(pos.getX() + (x_w / 2), pos.getY() - (y_w / 2), LengthUnit.METER);
        poly.addPoint(pos.getX() + (x_w / 2), pos.getY() + (y_w / 2), LengthUnit.METER);
        poly.addPoint(pos.getX() - (x_w / 2), pos.getY() + (y_w / 2), LengthUnit.METER);

        patch.setBorder(poly);

        patch.setSurfaceName(msg.getName());

        return patch;
    }

    @Override
    public Class<Object> getMessageType() {
        return Object.class;
    }

    @Override
    public Class<PlanePatch> getDataType() {
        return PlanePatch.class;
    }

}
