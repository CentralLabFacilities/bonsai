package de.unibi.citec.clf.btl.ros.serializers.person;

import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.LengthUnit;
import org.ros.message.MessageFactory;
import people_msgs.PositionMeasurement;

public class PeopleMsgsPositionMeasurement extends RosSerializer<PersonData, PositionMeasurement> {

    private static org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(PeopleMsgsPositionMeasurement.class);

    @Override
    public PersonData deserialize(PositionMeasurement msg) throws DeserializationException {
        PersonData person = new PersonData();

        MsgTypeFactory.setHeader(person,msg.getHeader());

        Point3D point = MsgTypeFactory.getInstance().createType(msg.getPos(), Point3D.class);
        PositionData pose = new PositionData();
        pose.setX(point.getX(LengthUnit.METER),LengthUnit.METER);
        pose.setY(point.getY(LengthUnit.METER),LengthUnit.METER);
        person.setPosition(pose);

        person.setName(msg.getName());
        person.setUuid(msg.getObjectId());



        return person;
    }

    @Override
    public PositionMeasurement serialize(PersonData data, MessageFactory fact) throws SerializationException {
        PositionMeasurement people = fact.newFromType(PositionMeasurement._TYPE);
        throw new UnsupportedOperationException("Not supported yet."); //To change body of generated methods, choose Tools | Templates.
    }

    @Override
    public Class<PositionMeasurement> getMessageType() {
        return PositionMeasurement.class;
    }

    @Override
    public Class<PersonData> getDataType() {
        return PersonData.class;
    }

}
