package de.unibi.citec.clf.btl.data.object;



import de.unibi.citec.clf.btl.List;

/**
 * Results of the object recognition. This class is meat so define the location
 * of the object in the detector's camera image! The given polygon describes the
 * objects's location in pixel coordinates! If you want to define an object in
 * world coordinates use {@link ObjectPositionData}.
 * 
 * @author lziegler
 */
@Deprecated
public class ObjectLocationList extends List<ObjectLocationData> {

    /**
     * Default constructor.
     */
    public ObjectLocationList() {
        super(ObjectLocationData.class);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        String text = "[OBJECTLOCATIONLIST\n";
        for (ObjectLocationData data : this) {
            text += "\t" + data.toString() + "\n";
        }
        text += "]";
        return text;
    }
}
