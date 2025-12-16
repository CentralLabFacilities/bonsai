package de.unibi.citec.clf.btl.data.person;



import org.apache.log4j.Logger;

import de.unibi.citec.clf.btl.List;

/**
 * A collection of person data.
 * 
 * @author: Denis Schulze <dschulze@techfak.uni-bielefeld.de>
 */
public class PersonDataList extends List<PersonData> {

    private static final Logger logger = Logger.getLogger(PersonDataList.class);

    /** Constructor. */
    public PersonDataList() {
        super(PersonData.class);
    }

    /** Constructor. */
    public PersonDataList(PersonDataList other) {
        super(other);
    }

    /** Constructor. */
    public PersonDataList(List<PersonData> other) {
        super(other);
    }

    /** Update an existing PersonData by index. */
    public void updatePersonData(int index, PersonData data) {
        set(index, data);
    }

    /** Delete PersonData with given index. */
    public void deletePersonData(int index) {
        remove(index);
    }

    /** Removes all person data from this list. */
    public void clearList() {
        clear();
    }

    public PersonData getPersonById(String personId) {
        for (PersonData p : elements) {
            if (p.getUuid().equals(personId)) {
                return p;
            }
        }
        return null;
    }


}
