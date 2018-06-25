package de.unibi.citec.clf.btl.ros.serializers.state;

import de.unibi.citec.clf.btl.data.status.BatteryState;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.message.MessageFactory;

public class BatteryStateSerializer extends RosSerializer<BatteryState, sensor_msgs.BatteryState> {

    @Override
    public sensor_msgs.BatteryState serialize(BatteryState data, MessageFactory fact) throws SerializationException {
        final sensor_msgs.BatteryState msg = fact.newFromType(sensor_msgs.BatteryState._TYPE);
        msg.setCharge(data.getCharge());
        msg.setPercentage(data.getPercentage());
        return msg;
    }

    @Override
    public BatteryState deserialize(sensor_msgs.BatteryState msg) throws DeserializationException {
        final BatteryState data = new BatteryState();
        data.setPercentage(msg.getPercentage());
        data.setCharge(msg.getCharge());
        return data;
    }

    @Override
    public Class<sensor_msgs.BatteryState> getMessageType() {
        return sensor_msgs.BatteryState.class;
    }

    @Override
    public Class<BatteryState> getDataType() {
        return BatteryState.class;
    }

}
