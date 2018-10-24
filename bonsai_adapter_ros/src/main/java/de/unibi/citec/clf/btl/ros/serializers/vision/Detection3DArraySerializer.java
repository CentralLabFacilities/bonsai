package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.data.object.ObjectData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.message.MessageFactory;
import vision_msgs.Detection3D;
import vision_msgs.Detection3DArray;
import vision_msgs.ObjectHypothesisWithPose;

import java.util.LinkedList;
import java.util.List;

/**
 * @author lruegeme
 */
public class Detection3DArraySerializer extends RosSerializer<ObjectShapeList, vision_msgs.Detection3DArray> {

    @Override
    public vision_msgs.Detection3DArray serialize(ObjectShapeList data, MessageFactory fact) throws SerializationException {
        List<vision_msgs.Detection3D> list = new LinkedList<>();
        for(ObjectShapeData osd : data) {
            list.add(MsgTypeFactory.getInstance().createMsg(osd,vision_msgs.Detection3D._TYPE));
        }

        vision_msgs.Detection3DArray msg = fact.newFromType(Detection3DArray._TYPE);
        msg.setDetections(list);

        return msg;

    }

    @Override
    public ObjectShapeList deserialize(vision_msgs.Detection3DArray msg) throws DeserializationException {
        MsgTypeFactory fac = MsgTypeFactory.getInstance();

        ObjectShapeList data = new ObjectShapeList();
        int id = 0;

        for(vision_msgs.Detection3D detection3d : msg.getDetections()) {
            ObjectShapeData osd = fac.createType(detection3d,ObjectShapeData.class);
            //todo
            osd.setId(String.valueOf(id++));
            data.add(osd);
        }

        return data;
    }

    @Override
    public Class<vision_msgs.Detection3DArray> getMessageType() {
        return vision_msgs.Detection3DArray.class;
    }

    @Override
    public Class<ObjectShapeList> getDataType() {
        return ObjectShapeList.class;
    }

}
