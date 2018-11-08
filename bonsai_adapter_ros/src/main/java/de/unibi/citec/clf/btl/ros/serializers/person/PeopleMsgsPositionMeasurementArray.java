package de.unibi.citec.clf.btl.ros.serializers.person;

import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.message.MessageFactory;
import people_msgs.PositionMeasurement;
import people_msgs.PositionMeasurementArray;

public class PeopleMsgsPositionMeasurementArray extends RosSerializer<PersonDataList, PositionMeasurementArray> {

    private static org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(PeopleMsgsPositionMeasurementArray.class);

    @Override
    public PersonDataList deserialize(PositionMeasurementArray msg) throws DeserializationException {
        PersonDataList persons = new PersonDataList();

        for (PositionMeasurement i : msg.getPeople()) {
            persons.add(MsgTypeFactory.getInstance().createType(i, PersonData.class));
        }

        return persons;
    }

    @Override
    public PositionMeasurementArray serialize(PersonDataList data, MessageFactory fact) throws SerializationException {
        PositionMeasurementArray people = fact.newFromType(PositionMeasurementArray._TYPE);
        throw new UnsupportedOperationException("Not supported yet."); //To change body of generated methods, choose Tools | Templates.
    }

    @Override
    public Class<PositionMeasurementArray> getMessageType() {
        return PositionMeasurementArray.class;
    }

    @Override
    public Class<PersonDataList> getDataType() {
        return PersonDataList.class;
    }

}
