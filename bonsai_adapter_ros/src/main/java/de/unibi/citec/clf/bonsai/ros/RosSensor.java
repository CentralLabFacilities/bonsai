package de.unibi.citec.clf.bonsai.ros;

import de.unibi.citec.clf.bonsai.core.object.Sensor;
import org.ros.internal.message.Message;

/**
 * @author lruegeme
 */
public abstract class RosSensor<DataType extends Object, MsgType extends Message> extends RosNode implements Sensor<DataType> {

    protected Class<DataType> dataTypeClass;
    protected Class<MsgType> msgType;

    public RosSensor(Class<DataType> typeClass, Class<MsgType> rosType) {
        this.msgType = rosType;
        this.dataTypeClass = typeClass;
    }

    @Override
    public Class<DataType> getDataType() {
        return dataTypeClass;
    }

    public Class<MsgType> getMsgType() {
        return msgType;
    }


}
