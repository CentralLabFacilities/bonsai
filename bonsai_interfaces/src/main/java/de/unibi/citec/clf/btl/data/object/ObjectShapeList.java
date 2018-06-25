package de.unibi.citec.clf.btl.data.object;



import de.unibi.citec.clf.btl.List;

/**
 * Results of the object recognition. This class is meat so define the location
 * of the object in the detector's camera image and contain shape information in
 * 3D! The given polygon describes the objects's location in pixel coordinates!
 * 
 * @author lziegler
 */
public class ObjectShapeList extends List<ObjectShapeData> {

    /**
     * Default constructor.
     */
    public ObjectShapeList() {
        super(ObjectShapeData.class);
    }

    /**
     * Copy constructor.
     */
    public ObjectShapeList(ObjectShapeList osl) {
        super(osl);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        String text = "[OBJECTSHAPELIST\n";
        for (ObjectShapeData data : this) {
            text += "\t" + data.toString() + "\n";
        }
        text += "]";
        return text;
    }
}
