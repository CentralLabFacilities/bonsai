package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.Point2DStamped;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import org.ros.message.MessageFactory;

public class BoundingBox2DSerializer extends RosSerializer<PrecisePolygon, vision_msgs.BoundingBox2D> {
    @Override
    public vision_msgs.BoundingBox2D serialize(PrecisePolygon data, MessageFactory fact) throws SerializationException {
        vision_msgs.BoundingBox2D msg = fact.newFromType(vision_msgs.BoundingBox2D._TYPE);

        msg.setCenter(MsgTypeFactory.getInstance().createMsg(data.getCentroid(),geometry_msgs.Pose._TYPE));
        msg.setSizeX(data.getMaxX(LengthUnit.METER)-data.getMinX(LengthUnit.METER));
        msg.setSizeY(data.getMaxY(LengthUnit.METER)-data.getMaxY(LengthUnit.METER));

        return msg;
    }

    @Override
    public PrecisePolygon deserialize(vision_msgs.BoundingBox2D msg) throws DeserializationException {
        PrecisePolygon data = new PrecisePolygon();

        data.addPoint(new Point2D((msg.getCenter().getX()-msg.getSizeX()/2),(msg.getCenter().getY()-msg.getSizeY()/2)));
        data.addPoint(new Point2D((msg.getCenter().getX()+msg.getSizeX()/2),(msg.getCenter().getY()-msg.getSizeY()/2)));
        data.addPoint(new Point2D((msg.getCenter().getX()-msg.getSizeX()/2),(msg.getCenter().getY()+msg.getSizeY()/2)));
        data.addPoint(new Point2D((msg.getCenter().getX()+msg.getSizeX()/2),(msg.getCenter().getY()+msg.getSizeY()/2)));

        return data;
    }

    @Override
    public Class<vision_msgs.BoundingBox2D> getMessageType() {
        return vision_msgs.BoundingBox2D.class;
    }

    @Override
    public Class<PrecisePolygon> getDataType() {
        return PrecisePolygon.class;
    }
}
