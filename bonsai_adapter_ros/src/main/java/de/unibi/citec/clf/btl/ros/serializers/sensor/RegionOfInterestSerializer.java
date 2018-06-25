package de.unibi.citec.clf.btl.ros.serializers.sensor;


import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import org.ros.message.MessageFactory;
import sensor_msgs.RegionOfInterest;

/**
 * @author jkummert
 */

public class RegionOfInterestSerializer extends RosSerializer<PrecisePolygon, sensor_msgs.RegionOfInterest> {

    @Override
    public RegionOfInterest serialize(PrecisePolygon data, MessageFactory fact) throws SerializationException {
        RegionOfInterest ret = fact.newFromType(RegionOfInterest._TYPE);
        //TODO
        throw new UnsupportedOperationException();

    }

    @Override
    public PrecisePolygon deserialize(RegionOfInterest msg) throws DeserializationException {
        PrecisePolygon pol = new PrecisePolygon();
        pol.addPoint(msg.getXOffset(), msg.getYOffset(), LengthUnit.METER);
        pol.addPoint(msg.getXOffset() + msg.getWidth(), msg.getYOffset(), LengthUnit.METER);
        pol.addPoint(msg.getXOffset() + msg.getWidth(), msg.getYOffset() + msg.getHeight(), LengthUnit.METER);
        pol.addPoint(msg.getXOffset(), msg.getYOffset() + msg.getHeight(), LengthUnit.METER);
        return pol;
    }

    @Override
    public Class<RegionOfInterest> getMessageType() {
        return RegionOfInterest.class;
    }

    @Override
    public Class<PrecisePolygon> getDataType() {
        return PrecisePolygon.class;
    }


}
