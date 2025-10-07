/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.unibi.citec.clf.btl.ros.serializers.vision1d;

import de.unibi.citec.clf.btl.data.vision1d.Color;
import de.unibi.citec.clf.btl.data.vision1d.LaserData;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import org.ros.message.MessageFactory;
import sensor_msgs.LaserScan;

/**
 * @author lruegeme
 */
public class StdColorToColor extends RosSerializer<Color, std_msgs.ColorRGBA> {

    @Override
    public Class<std_msgs.ColorRGBA> getMessageType() {
        return std_msgs.ColorRGBA.class;
    }

    @Override
    public std_msgs.ColorRGBA serialize(Color data, MessageFactory fact) throws SerializationException {
        std_msgs.ColorRGBA msg = fact.newFromType(std_msgs.ColorRGBA._TYPE);
        msg.setA(data.getA());
        msg.setB(data.getB());
        msg.setG(data.getG());
        msg.setR(data.getR());
        return msg;
    }

    @Override
    public Color deserialize(std_msgs.ColorRGBA msg) throws DeserializationException {
        return new Color(msg.getR(),msg.getG(), msg.getB(), msg.getA());
    }

    @Override
    public Class<Color> getDataType() {
        return Color.class;
    }

}
