

package de.unibi.citec.clf.btl.data.object;



import de.unibi.citec.clf.btl.List;

/**
 *
 * @author nrasic
 */
public class ObjectHypothesisList extends List<ObjectShapeData.Hypothesis>{
        /**
     * Default constructor.
     */
    public ObjectHypothesisList() {
        super(ObjectShapeData.Hypothesis.class);
    }

    /**
     * Copy constructor.
     */
    public ObjectHypothesisList(ObjectHypothesisList ohl) {
        super(ohl);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        String text = "[OBJECTSHYPOTHSISLIST\n";
        for (ObjectShapeData.Hypothesis data : this) {
            text += "\t" + data.toString() + "\n";
        }
        text += "]";
        return text;
    }
}
