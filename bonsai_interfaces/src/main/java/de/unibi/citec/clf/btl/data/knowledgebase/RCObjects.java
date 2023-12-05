package de.unibi.citec.clf.btl.data.knowledgebase;

import de.unibi.citec.clf.btl.Type;
import java.util.Comparator;
import java.util.LinkedList;
import java.util.Objects;


/**
 *
 * @author rfeldhans
 */
@Deprecated
public class RCObjects extends Type {

    private Comparator<RCObject> compSize = (o1, o2) -> {
        return o1.getSize() < o2.getSize()
                ? -1 : o1.getSize() > o2.getSize()
                        ? 1 : 0;
    };

    private Comparator<RCObject> compWeight = (o1, o2) -> {
        return o1.getWeight() < o2.getWeight()
                ? -1 : o1.getWeight() > o2.getWeight()
                        ? 1 : 0;
    };

    private LinkedList<RCObject> rcobjectList;

    public LinkedList<RCObject> getRCObjects() {
        return rcobjectList;
    }

    public void setRCObjects(LinkedList<RCObject> objects) {
        this.rcobjectList = objects;
    }

    public int getNumberOfCategorys(String category) {
        int counter = 0;
        for (RCObject obj : rcobjectList) {
            if (category.equals(obj.getCategory())) {
                counter++;
            }
        }
        return counter;
    }

    public RCObject getSpecificRCObject(String name) {
        RCObject object = null;
        for (RCObject obj : rcobjectList) {
            if (name.equals(obj.getName())) {
                object = obj;
            }
        }
        return object;
    }

    public LinkedList<RCObject> getRCObjectsInSpecificLocation(String location) {
        LinkedList<RCObject> list = new LinkedList();

        for (RCObject obj : rcobjectList) {
            if (location.equals(obj.getLocation())) {
                list.add(obj);
            }
        }

        return list;
    }

    public LinkedList<RCObject> filterForCategory(LinkedList<RCObject> list, String category) {
        LinkedList<RCObject> newlist = new LinkedList();

        for (RCObject obj : list) {
            if (category.equals(obj.getCategory())) {
                newlist.add(obj);
            }
        }

        return newlist;
    }

    /**
     * Get a Comparator to sort a list of RCObjects.
     *
     * @param attribute may be "size", "weight" or "graspdifficulty"
     * @return
     */
    public Comparator<RCObject> getRCComparator(String attribute) {
        switch (attribute) {
            case "size":
                return this.compSize;
            case "weight":
                return this.compWeight;
            default:
                throw new RuntimeException("Unsupported attribute for Comparator");
        }
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RCObjects)) return false;
        if (!super.equals(o)) return false;
        RCObjects rcObjects = (RCObjects) o;
        return Objects.equals(rcobjectList, rcObjects.rcobjectList);
    }

    @Override
    public int hashCode() {
        int hash = 7;
        hash = 59 * hash + Objects.hashCode(this.rcobjectList);
        return hash;
    }

    @Override
    public String toString(){
        String objs = "[";
        for(RCObject obj : this.rcobjectList){
            objs += obj.toString() + "\n";
        }
        return  objs + "]";
    }

}
