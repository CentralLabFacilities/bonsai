package de.unibi.citec.clf.btl.data.object;


import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;

/**
 * Results of the object recognition. This class is meat so define the location
 * of the object in the detector's camera image! The given polygon describes the
 * objects's location in pixel coordinates! If you want to define an object in
 * world coordinates use {@link ObjectPositionData}.
 *
 * @author lziegler
 */
@Deprecated
public class ObjectLocationData extends ObjectData {

    /**
     * Position of the object in the sensor's image.
     */
    private PrecisePolygon polygon;

    public PrecisePolygon getPolygon() {
        return polygon;
    }
    public void setPolygon(PrecisePolygon polygon) {
        this.polygon = polygon;
    }

    public ObjectLocationData() {
    }

    public ObjectLocationData(ObjectLocationData data) {
        super(data);
        polygon = new PrecisePolygon(data.polygon);
        hypotheses.clear();
        for (Hypothesis h : data.getHypotheses()) {
            addHypothesis(new Hypothesis(h));
        }
    }

    @Override
    public String toString() {
        String out = "[OBJECTLOCATION super=" + super.toString();

        out += " Polygon=" + polygon.toString() + "]";
        out += "]";
        return out;
    }
}
