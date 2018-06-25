package de.unibi.citec.clf.btl.data.vision2d;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;

public class RegionData extends Type {

	public static final String SCOPE_TAG_NAME = "SCOPE";

	public enum Scope {
		LOCAL, GLOBAL
	}

    /**
	 * Position of the object in the sensor's image.
	 */
	protected PrecisePolygon polygon = new PrecisePolygon();

	protected Scope scope = Scope.GLOBAL;

	public RegionData() {
	}
	
	public RegionData(RegionData region) {
        this.polygon = region.polygon;
        this.scope = region.scope;
    }

	public RegionData(PrecisePolygon polygon) {
		this.polygon = polygon;
	}

	public RegionData(PrecisePolygon polygon, Scope scope) {
		this.polygon = polygon;
		this.scope = scope;
	}

	public RegionData(Scope scope) {
		this.scope = scope;
	}

	public PrecisePolygon getPolygon() {
		return polygon;
	}

	public void setPolygon(PrecisePolygon polygon) {
		this.polygon = polygon;
	}

	public Scope getScope() {
		return scope;
	}

	public void setScope(Scope scope) {
		this.scope = scope;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "[" + getClass().getSimpleName() + " timestamp: " + getTimestamp()
				+ " scope: " + scope + " Polygon: " + polygon + "]";

	}
}
