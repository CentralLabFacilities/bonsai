package de.unibi.citec.clf.btl.ros.serializers.vision;

import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.object.ObjectData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import geometry_msgs.Point;
import geometry_msgs.Pose;
import org.apache.log4j.Logger;
import org.ros.message.MessageFactory;
import vision_msgs.Detection3D;
import vision_msgs.ObjectHypothesisWithPose;

import java.util.LinkedList;
import java.util.List;

/**
 * @author lruegeme
 */
public class Detection3DSerializer extends RosSerializer<ObjectShapeData, vision_msgs.Detection3D> {

    private Logger logger = Logger.getLogger(getClass());

    final LengthUnit lum = LengthUnit.METER;
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
        ObjectShapeData data = new ObjectShapeData();

        // OSD header
        MsgTypeFactory.setHeader(data,msg.getHeader());

        // Bounding box
        data.setBoundingBox(MsgTypeFactory.getInstance().createType(msg.getBbox(),BoundingBox3D.class));
        MsgTypeFactory.setHeader(data.getBoundingBox(),msg.getHeader());
        MsgTypeFactory.setHeader(data.getBoundingBox().getPose(),msg.getHeader());

         // Hypotheses
        for(ObjectHypothesisWithPose hyp : msg.getResults()) {
            data.addHypothesis(MsgTypeFactory.getInstance().createType(hyp,ObjectData.Hypothesis.class));
        }

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
