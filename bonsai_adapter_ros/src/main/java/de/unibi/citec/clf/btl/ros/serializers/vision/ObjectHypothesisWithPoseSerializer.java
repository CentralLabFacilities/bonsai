package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.object.ObjectData;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.message.MessageFactory;
import vision_msgs.ObjectHypothesisWithPose;

/**
 * @author lruegeme
 */
public class ObjectHypothesisWithPoseSerializer extends RosSerializer<ObjectData.Hypothesis, vision_msgs.ObjectHypothesisWithPose> {

    @Override
    public vision_msgs.ObjectHypothesisWithPose serialize(ObjectData.Hypothesis data, MessageFactory fact) throws SerializationException {
        vision_msgs.ObjectHypothesisWithPose msg = fact.newFromType(vision_msgs.ObjectHypothesisWithPose._TYPE);
        msg.setScore(data.getReliability());

        //todo ID MAPPING
        msg.setId(Long.valueOf(data.getClassLabel()));
        //todo pose

        return msg;
    }

    @Override
    public ObjectData.Hypothesis deserialize(vision_msgs.ObjectHypothesisWithPose msg) throws DeserializationException {
        ObjectData.Hypothesis hyp = new ObjectData.Hypothesis();
        hyp.setClassLabel(String.valueOf(msg.getId()));
        hyp.setReliability(msg.getScore());
        return hyp;
    }

    @Override
    public Class<vision_msgs.ObjectHypothesisWithPose> getMessageType() {
        return vision_msgs.ObjectHypothesisWithPose.class;
    }

    @Override
    public Class<ObjectData.Hypothesis> getDataType() {
        return ObjectData.Hypothesis.class;
    }

}
