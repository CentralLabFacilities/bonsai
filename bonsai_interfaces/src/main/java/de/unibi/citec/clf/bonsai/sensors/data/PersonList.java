package de.unibi.citec.clf.bonsai.sensors.data;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.person.PersonData;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;

/**
 * Domain class holding Person objects.
 * 
 * @author lschilli
 */
public class PersonList extends Type implements Iterable<PersonData> {

    private HashMap<String, PersonData> personmap = new LinkedHashMap<>();

    /**
     * Adds a person to this list.
     * 
     * @param p
     *            new person to add
     */
    public void addPerson(PersonData p) {
        personmap.put(p.getUuid(), p);
    }

    /**
     * Returns the person with the given id in this list or <code>null</code> if
     * not contained.
     * 
     * @param id
     *            id to search for
     * @return person or <code>null</code> if not found
     */
    public PersonData getPersonById(String id) {
        return personmap.get(id);
    }

    @Override
    public Iterator<PersonData> iterator() {
        return personmap.values().iterator();
    }

    /**
     * Returns the number of contained persons.
     * 
     * @return number >= 0
     */
    public int size() {
        return personmap.size();
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return personmap.values().toString();
    }

    /**
     * Gives the first Element of the Array behind the Collection.
     * 
     * @return null if empty
     */
    public PersonData getFirst() {
        if (personmap != null && !personmap.isEmpty())
            return (PersonData) personmap.values().toArray()[0];
        else
            return null;
    }

}
