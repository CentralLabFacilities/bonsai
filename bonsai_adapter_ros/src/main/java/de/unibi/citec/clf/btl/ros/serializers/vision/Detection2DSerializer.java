package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.object.ObjectData;
import de.unibi.citec.clf.btl.data.object.ObjectLocationData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.message.MessageFactory;
import vision_msgs.Detection2D;
import vision_msgs.ObjectHypothesisWithPose;

import java.util.LinkedList;
import java.util.List;

public class Detection2DSerializer extends RosSerializer<ObjectLocationData, Detection2D> {
    @Override
    public vision_msgs.Detection2D serialize(ObjectLocationData data, MessageFactory fact) throws SerializationException {
        vision_msgs.Detection2D msg = fact.newFromType(vision_msgs.Detection2D._TYPE);

        msg.setHeader(MsgTypeFactory.getInstance().makeHeader(data));
        msg.setBbox(MsgTypeFactory.getInstance().createMsg(data.getPolygon(),vision_msgs.BoundingBox2D._TYPE));
        List<ObjectHypothesisWithPose> list = new LinkedList<>();
        for(ObjectData.Hypothesis hyp : data.getHypotheses()) {
            vision_msgs.ObjectHypothesisWithPose hypothesisWithPose = MsgTypeFactory.getInstance().createMsg(hyp,vision_msgs.ObjectHypothesisWithPose._TYPE);
            //todo
            //hypothesisWithPose.setPose();
            list.add(hypothesisWithPose);
        }
        msg.setResults(list);

        return msg;
    }

    @Override
    public ObjectLocationData deserialize(vision_msgs.Detection2D msg) throws DeserializationException {
        MsgTypeFactory fac = MsgTypeFactory.getInstance();


        ObjectLocationData data = new ObjectLocationData();
        fac.setHeader(data,msg.getHeader());

        for(ObjectHypothesisWithPose hyp : msg.getResults()) {
            data.addHypothesis(fac.createType(hyp,ObjectData.Hypothesis.class));
        }

        data.setPolygon(fac.createType(msg.getBbox(), PrecisePolygon.class));

        return data;
    }

    @Override
    public Class<vision_msgs.Detection2D> getMessageType() {
        return vision_msgs.Detection2D.class;
    }

    @Override
    public Class<ObjectLocationData> getDataType() {
        return ObjectLocationData.class;
    }
}
