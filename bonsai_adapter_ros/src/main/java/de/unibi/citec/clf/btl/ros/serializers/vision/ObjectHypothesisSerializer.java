package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.data.object.ObjectData;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.message.MessageFactory;
import vision_msgs.ObjectHypothesis;

/**
 * @author lruegeme
 */
public class ObjectHypothesisSerializer extends RosSerializer<ObjectData.Hypothesis, vision_msgs.ObjectHypothesis> {

    @Override
    public vision_msgs.ObjectHypothesis serialize(ObjectData.Hypothesis data, MessageFactory fact) throws SerializationException {
        vision_msgs.ObjectHypothesis msg = fact.newFromType(vision_msgs.ObjectHypothesis._TYPE);
        msg.setScore(data.getReliability());

        //todo ID MAPPING
        msg.setId(Long.valueOf(data.getClassLabel()));

        return msg;
    }

    @Override
    public ObjectData.Hypothesis deserialize(vision_msgs.ObjectHypothesis msg) throws DeserializationException {
        ObjectData.Hypothesis hyp = new ObjectData.Hypothesis();
        hyp.setClassLabel(String.valueOf(msg.getId()));
        hyp.setReliability(msg.getScore());
        return hyp;
    }

    @Override
    public Class<vision_msgs.ObjectHypothesis> getMessageType() {
        return vision_msgs.ObjectHypothesis.class;
    }

    @Override
    public Class<ObjectData.Hypothesis> getDataType() {
        return ObjectData.Hypothesis.class;
    }

}
