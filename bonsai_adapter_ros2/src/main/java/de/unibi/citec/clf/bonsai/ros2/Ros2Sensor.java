package de.unibi.citec.clf.bonsai.ros2;

import de.unibi.citec.clf.bonsai.core.object.Sensor;
import id.jros2client.JRos2Client;
import id.jrosmessages.Message;

/**
 * @author lruegeme
 */
public abstract class Ros2Sensor<DataType extends Object, MsgType extends Message> extends Ros2Node implements Sensor<DataType> {

    protected Class<DataType> dataTypeClass;
    protected Class<MsgType> msgType;

    public Ros2Sensor(Class<DataType> typeClass, Class<MsgType> rosType, JRos2Client client) {
        this.msgType = rosType;
        this.dataTypeClass = typeClass;
        this.client = client;
    }

    @Override
    public Class<DataType> getDataType() {
        return dataTypeClass;
    }

    public Class<MsgType> getMsgType() {
        return msgType;
    }

}
