package de.unibi.citec.clf.btl.data.navigation;



import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import org.apache.log4j.Logger;

import de.unibi.citec.clf.btl.List;

/**
 * A collection of person data.
 * 
 * @author: Denis Schulze <dschulze@techfak.uni-bielefeld.de>
 */
public class PositionDataList extends List<Pose2D> {

    private static final Logger logger = Logger.getLogger(PositionDataList.class);

    /** Constructor. */
    public PositionDataList() {
        super(Pose2D.class);
    }

    /** Constructor. */
    public PositionDataList(PositionDataList other) {
        super(other);
    }

    /** Constructor. */
    public PositionDataList(List<Pose2D> other) {
        super(other);
    }

    /** Adds new person data to this list. */
    public void addPositionData(Pose2D data) {
        add(data);
    }

    /** Returns the person data from the list. */
    public Pose2D getPositionData(int index) {
        if (index > size())
            return null;

        return get(index);
    }

    /** Update an existing PositionData by index. */
    public void updatePositionData(int index, Pose2D data) {
        set(index, data);
    }

    /** Delete PositionData with given index. */
    public void deletePositionData(int index) {
        remove(index);
    }

    /** Removes all person data from this list. */
    public void clearList() {
        clear();
    }

    

}
