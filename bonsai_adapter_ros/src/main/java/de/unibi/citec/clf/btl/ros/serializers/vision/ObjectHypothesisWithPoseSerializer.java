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
        return MsgTypeFactory.getInstance().createMsg(data,ObjectHypothesisWithPose._TYPE);
    }

    @Override
    public ObjectData.Hypothesis deserialize(vision_msgs.ObjectHypothesisWithPose msg) throws DeserializationException {
        return MsgTypeFactory.getInstance().createType(msg,ObjectData.Hypothesis.class);
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
