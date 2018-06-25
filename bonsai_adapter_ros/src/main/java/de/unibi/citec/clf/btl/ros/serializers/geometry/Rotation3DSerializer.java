package de.unibi.citec.clf.btl.ros.serializers.geometry;


import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import geometry_msgs.Quaternion;
import org.ros.message.MessageFactory;

import javax.vecmath.Quat4d;


/**
 * @author jkummert
 */
public class Rotation3DSerializer extends RosSerializer<Rotation3D, geometry_msgs.Quaternion> {

    public Rotation3DSerializer() {
//        final ProtocolBufferConverter<PoseType.Posture> converter0 = new ProtocolBufferConverter<PoseType.Posture>(
//                PoseType.Posture.getDefaultInstance());
//
//        // register data types
//        ConverterRepository<ByteBuffer> repo = DefaultConverterRepository
//                .getDefaultConverterRepository();
//
//        repo.addConverter(converter0);
//        
//        System.out.println("Registered Converter!");

    }

    @Override
    public Class<geometry_msgs.Quaternion> getMessageType() {
        return geometry_msgs.Quaternion.class;
    }

    @Override
    public Class<Rotation3D> getDataType() {
        return Rotation3D.class;
    }

    @Override
    public geometry_msgs.Quaternion serialize(Rotation3D data, MessageFactory fact) throws SerializationException {
        geometry_msgs.Quaternion ret = fact.newFromType(geometry_msgs.Quaternion._TYPE);

        Quat4d quat = data.getQuaternion();
        ret.setW(quat.w);
        ret.setX(quat.x);
        ret.setY(quat.y);
        ret.setZ(quat.z);
        return ret;
    }

    @Override
    public Rotation3D deserialize(Quaternion msg) throws DeserializationException {
        Quat4d quat = new Quat4d(msg.getX(), msg.getY(), msg.getZ(), msg.getW());
        Rotation3D rot = new Rotation3D(quat);
        return rot;
    }

}
