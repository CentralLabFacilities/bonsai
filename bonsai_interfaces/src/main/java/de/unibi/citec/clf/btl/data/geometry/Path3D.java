package de.unibi.citec.clf.btl.data.geometry;



import de.unibi.citec.clf.btl.Type;

public class Path3D extends Type {

	public static final String SCOPE_TAG_NAME = "SCOPE";

	public enum Scope {
		LOCAL, GLOBAL
	}

    /**
	 * Position of the object in the sensor's image.
	 */
	protected PrecisePolygon3D polygon = new PrecisePolygon3D();

	protected Scope scope = Scope.GLOBAL;

	public Path3D() {
	}
	public Path3D(Path3D p) {
		this.polygon = new PrecisePolygon3D(p.polygon);
		this.scope = p.scope;
	}

	public Path3D(PrecisePolygon3D polygon) {
		this.polygon = polygon;
	}

	public Path3D(PrecisePolygon3D polygon, Scope scope) {
		this.polygon = polygon;
		this.scope = scope;
	}

	public Path3D(Scope scope) {
		this.scope = scope;
	}

	public PrecisePolygon3D getPolygon() {
		return polygon;
	}

	public void setPolygon(PrecisePolygon3D polygon) {
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
