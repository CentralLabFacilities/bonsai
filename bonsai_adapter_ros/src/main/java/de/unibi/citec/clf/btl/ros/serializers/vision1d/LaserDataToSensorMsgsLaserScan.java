/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.unibi.citec.clf.btl.ros.serializers.vision1d;

import de.unibi.citec.clf.btl.data.vision1d.LaserData;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import org.ros.message.MessageFactory;
import sensor_msgs.LaserScan;

/**
 * @author ffriese
 */
public class LaserDataToSensorMsgsLaserScan extends RosSerializer<LaserData, sensor_msgs.LaserScan> {

    @Override
    public Class<LaserScan> getMessageType() {
        return LaserScan.class;
    }

    @Override
    public LaserScan serialize(LaserData data, MessageFactory fact) throws SerializationException {
        sensor_msgs.LaserScan scan = fact.newFromType(sensor_msgs.LaserScan._TYPE);

        double angle = data.getScanAngle(AngleUnit.RADIAN);
        scan.setAngleIncrement((float) angle / (float) data.getNumLaserPoints());
        scan.setAngleMin(-(float) angle / 2.0f);
        scan.setAngleMax((float) angle / 2.0f);
        double[] d_ranges = data.getScanValues(LengthUnit.METER);
        float[] f_ranges = new float[d_ranges.length];
        for (int i = 0; i < d_ranges.length; i++) {
            f_ranges[i] = (float) d_ranges[i];
        }
        scan.setRanges(f_ranges);
        // TODO: check whether we need to implement these in the LaserData Type
        // scan.setRangeMin();
        // scan.setRangeMax();
        // scan.setScanTime();
        // scan.setTimeIncrement();
        return scan;
    }

    @Override
    public LaserData deserialize(LaserScan msg) throws DeserializationException {
        LaserData data = new LaserData();
        data.setScanAngle((double) msg.getAngleMax() - (double) msg.getAngleMin(), AngleUnit.RADIAN);
        float[] f_ranges = msg.getRanges();
        double[] d_ranges = new double[f_ranges.length];
        for (int i = 0; i < f_ranges.length; i++) {
            d_ranges[i] = (double) f_ranges[i];
        }
        data.setScanValues(d_ranges, LengthUnit.METER);
        return data;

    }

    @Override
    public Class<LaserData> getDataType() {
        return LaserData.class;
    }


}
