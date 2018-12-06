package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.object.ObjectLocationData;
import de.unibi.citec.clf.btl.data.object.ObjectLocationList;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.message.MessageFactory;
import vision_msgs.Detection2D;
import vision_msgs.Detection2DArray;

import java.util.LinkedList;
import java.util.List;

public class Detection2DArraySerializer extends RosSerializer<ObjectLocationList, vision_msgs.Detection2DArray> {
    @Override
    public vision_msgs.Detection2DArray serialize(ObjectLocationList data, MessageFactory fact) throws RosSerializer.SerializationException {
        List<Detection2D> list = new LinkedList<>();
        for(ObjectLocationData old : data) {
            list.add(MsgTypeFactory.getInstance().createMsg(old,vision_msgs.Detection3D._TYPE));
        }

        vision_msgs.Detection2DArray msg = fact.newFromType(Detection2DArray._TYPE);
        msg.setDetections(list);

        return msg;

    }

    @Override
    public ObjectLocationList deserialize(vision_msgs.Detection2DArray msg) throws RosSerializer.DeserializationException {
        MsgTypeFactory fac = MsgTypeFactory.getInstance();

        ObjectLocationList data = new ObjectLocationList();

        for(vision_msgs.Detection2D detection2d : msg.getDetections()) {
            ObjectLocationData old = fac.createType(detection2d,ObjectLocationData.class);
            data.add(old);
        }

        return data;
    }

    @Override
    public Class<vision_msgs.Detection2DArray> getMessageType() {
        return vision_msgs.Detection2DArray.class;
    }

    @Override
    public Class<ObjectLocationList> getDataType() {
        return ObjectLocationList.class;
    }
}
