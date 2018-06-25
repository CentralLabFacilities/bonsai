package de.unibi.citec.clf.bonsai.sensors;



import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

/**
 * An interface for sensor returning perceived persons which are currently
 * moving.
 * 
 * @author pdressel
 */
public interface PersonSensor extends Sensor<PersonDataList> {

    /**
     * This method returns a list with person which are considered as currently
     * moving. This persons will also have a global coordinate derived by the
     * position when the robot has seen this person.
     * 
     * @return PersonList with currently moving persons.
     */
    PersonDataList readMovingPersons();

	void setPositionSensor(Sensor<PositionData> posSens);

}
