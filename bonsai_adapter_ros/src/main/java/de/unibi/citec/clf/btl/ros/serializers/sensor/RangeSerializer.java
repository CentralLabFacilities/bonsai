package de.unibi.citec.clf.btl.ros.serializers.sensor;


import de.unibi.citec.clf.btl.data.vision1d.SonarData;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import org.ros.message.MessageFactory;

/**
 * @author jkummert
 */

public class RangeSerializer extends RosSerializer<SonarData, sensor_msgs.Range> {

    @Override
    public sensor_msgs.Range serialize(SonarData data, MessageFactory fact) throws SerializationException {
        throw new UnsupportedOperationException();
    }

    @Override
    public SonarData deserialize(sensor_msgs.Range msg) throws DeserializationException {
        SonarData sD = new SonarData();
        sD.setDistanceLeft(msg.getRange(), LengthUnit.METER);
        sD.setDistanceRight(msg.getRange(), LengthUnit.METER);
        return sD;
    }

    @Override
    public Class<sensor_msgs.Range> getMessageType() {
        return sensor_msgs.Range.class;
    }

    @Override
    public Class<SonarData> getDataType() {
        return SonarData.class;
    }


}
