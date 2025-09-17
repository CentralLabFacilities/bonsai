package de.unibi.citec.clf.btl.data.object;



import java.util.HashSet;
import java.util.Set;






import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * Results of the object recognition. This class is meant so define the position
 * of the object in the world! The given polygon describes the objects's
 * position in world coordinates! If you want to define the location in image
 * coordinates use {@link ObjectLocationData}.
 * 
 * @author lziegler
 */
public class ObjectPositionData extends ObjectData {

	private static final double DEFAULT_EDGE_LENGTH = 0.1;
	private static final double DEFAULT_RELIABILITY = 1.0;

	public static class Hypothesis extends ObjectData.Hypothesis {
	    
	    public Hypothesis() {
        }
	    
	    public Hypothesis(ObjectData.Hypothesis h) {
            super(h);
        }

		/**
		 * {@inheritDoc}
		 */
		@Override
		public String toString() {
			return super.toString();

		}
	}
	
	/**
	 * Position of the object in the sensor's image.
	 */
	private PrecisePolygon polygon;

	private String reference = "";

	private String coordinateKind = "";

	public PrecisePolygon getPolygon() {
		return polygon;
	}

	public void setPolygon(PrecisePolygon polygon) {
		this.polygon = polygon;
	}

	public String getReference() {
		return reference;
	}

	public void setReference(String reference) {
		this.reference = reference;
	}

	public String getCoordinateKind() {
		return coordinateKind;
	}

	public void setCoordinateKind(String coordinateKind) {
		this.coordinateKind = coordinateKind;
	}

	/**
	 * Default constructor.
	 */
	public ObjectPositionData() {
	}
	
	public ObjectPositionData(ObjectData o) {
	    super(o);
    }

	public Set<Hypothesis> getLocationHypotheses() {

		HashSet<Hypothesis> set = new HashSet<>();
		for (ObjectData.Hypothesis h : hypotheses) {
			if (h instanceof Hypothesis) {
				set.add((Hypothesis) h);
			}
		}
		return set;
	}

	/**
	 * @deprecated This method is not valid for subclasses of {@link ObjectData}
	 *             . Use {@link #getLocationHypotheses()} instead.
	 */
	@Deprecated
	public Set<ObjectData.Hypothesis> getHypotheses() {
		return super.getHypotheses();
	}

	public static ObjectPositionData fromPosition(Pose2D position,
                                                  String label) {
		return fromPosition(position, label, DEFAULT_EDGE_LENGTH,
				LengthUnit.METER, DEFAULT_RELIABILITY);
	}

	public static ObjectPositionData fromPosition(Pose2D position,
                                                  String label, double reliability) {
		return fromPosition(position, label, DEFAULT_EDGE_LENGTH,
				LengthUnit.METER, reliability);
	}

	public static ObjectPositionData fromPosition(Pose2D position,
                                                  String label, double edgeLength, LengthUnit unit) {
		return fromPosition(position, label, edgeLength, unit,
				DEFAULT_RELIABILITY);
	}

	public static ObjectPositionData fromPosition(Pose2D position,
                                                  String label, double edgeLength, LengthUnit unit, double reliability) {
		double half = edgeLength / 2.0;
		PrecisePolygon poly = new PrecisePolygon();
		poly.addPoint(position.getX(LengthUnit.METER) - half,
				position.getY(LengthUnit.METER) - half, unit);
		poly.addPoint(position.getX(LengthUnit.METER) - half,
				position.getY(LengthUnit.METER) + half, unit);
		poly.addPoint(position.getX(LengthUnit.METER) + half,
				position.getY(LengthUnit.METER) + half, unit);
		poly.addPoint(position.getX(LengthUnit.METER) + half,
				position.getY(LengthUnit.METER) - half, unit);
		Hypothesis hyp = new Hypothesis();
		hyp.setReliability(reliability);
		hyp.setClassLabel(label);
		ObjectPositionData obj = new ObjectPositionData();
		obj.addHypothesis(hyp);
		obj.setPolygon(poly);

		return obj;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		String out = super.toString().replace("[OBJECT", "[OBJECTPOSITION");
		out = out.replace("]", " Polygon: " + polygon + "]");
		return out;
	}
}
