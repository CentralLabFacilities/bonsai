package de.unibi.citec.clf.btl.data.speechrec;


import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.person.PersonData;
import org.apache.log4j.Logger;

/**
 * A collection of nlu.
 *
 */
public class NLUList extends List<NLU> {

    private static final Logger logger = Logger.getLogger(NLUList.class);

    /** Constructor. */
    public NLUList() {
        super(NLU.class);
    }

    /** Constructor. */
    public NLUList(NLUList other) {
        super(other);
    }

    /** Constructor. */
    public NLUList(List<NLU> other) {
        super(other);
    }
}
