package de.unibi.citec.clf.btl.data.navigation;


import de.unibi.citec.clf.btl.List;
import org.apache.log4j.Logger;

/**
 * A collection of navigation goal data.
 * 
 * @author: dleins
 */
public class NavigationGoalDataList extends List<NavigationGoalData> {

    private static final Logger logger = Logger.getLogger(NavigationGoalDataList.class);

    /** Constructor. */
    public NavigationGoalDataList() {
        super(NavigationGoalData.class);
    }

    /** Constructor. */
    public NavigationGoalDataList(NavigationGoalDataList other) {
        super(other);
    }

    /** Constructor. */
    public NavigationGoalDataList(List<NavigationGoalData> other) {
        super(other);
    }

    /** Adds new navigation goal data to this list. */
    public void addNavigationGoalData(NavigationGoalData data) {
        add(data);
    }

    /** Returns the navigation goal data from the list. */
    public NavigationGoalData getNavigationGoalData(int index) {
        if (index > size())
            return null;

        return get(index);
    }

    /** Update an existing NavigationGoalData by index. */
    public void updateNavigationGoalData(int index, NavigationGoalData data) {
        set(index, data);
    }

    /** Delete PositionData with given index. */
    public void deleteNavigationGoalData(int index) {
        remove(index);
    }

    /** Removes all navigation goal data from this list. */
    public void clearList() {
        clear();
    }

    

}
