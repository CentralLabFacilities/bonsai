package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.data.object.ObjectData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.message.MessageFactory;
import vision_msgs.Detection3D;
import vision_msgs.ObjectHypothesisWithPose;

import java.util.LinkedList;
import java.util.List;

/**
 * @author lruegeme
 */
public class Detection3DSerializer extends RosSerializer<ObjectShapeData, vision_msgs.Detection3D> {

    @Override
    public vision_msgs.Detection3D serialize(ObjectShapeData data, MessageFactory fact) throws SerializationException {
        vision_msgs.Detection3D msg = fact.newFromType(vision_msgs.Detection3D._TYPE);

        msg.setHeader(MsgTypeFactory.getInstance().makeHeader(data));
        msg.setBbox(MsgTypeFactory.getInstance().createMsg(data.getBoundingBox(),vision_msgs.BoundingBox3D._TYPE));
        List<vision_msgs.ObjectHypothesisWithPose> list = new LinkedList<>();
        for(ObjectData.Hypothesis hyp : data.getHypotheses()) {
            vision_msgs.ObjectHypothesisWithPose hypothesisWithPose = MsgTypeFactory.getInstance().createMsg(hyp,vision_msgs.ObjectHypothesisWithPose._TYPE);
            //todo
            //hypothesisWithPose.setPose();
            list.add(hypothesisWithPose);
        }
        msg.setResults(list);
        //todo
        //msg.setSourceCloud();

        return msg;
    }

    @Override
    public ObjectShapeData deserialize(vision_msgs.Detection3D msg) throws DeserializationException {
        MsgTypeFactory fac = MsgTypeFactory.getInstance();


        ObjectShapeData data = new ObjectShapeData();
        fac.setHeader(data,msg.getHeader());

        for(ObjectHypothesisWithPose hyp : msg.getResults()) {
            data.addHypothesis(fac.createType(hyp,ObjectData.Hypothesis.class));
        }

        data.setBoundingBox(fac.createType(msg.getBbox(),BoundingBox3D.class));

        //TODO
        //data.setId();

        return data;
    }

    @Override
    public Class<vision_msgs.Detection3D> getMessageType() {
        return vision_msgs.Detection3D.class;
    }

    @Override
    public Class<ObjectShapeData> getDataType() {
        return ObjectShapeData.class;
    }

}
