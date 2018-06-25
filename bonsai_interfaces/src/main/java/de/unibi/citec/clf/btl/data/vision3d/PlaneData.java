package de.unibi.citec.clf.btl.data.vision3d;



import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.vision2d.RegionData;
import de.unibi.citec.clf.btl.data.vision2d.RegionData.Scope;

/**
 * This type represents a plane in 3D space. It may be an infinite plane (if no
 * borders are specified) or a bordered plane if a polygon describing the
 * borders is specified.
 * 
 * @author lziegler
 */
public class PlaneData extends RegionData {

	public static final String ORIGIN_TAG_NAME = "ORIGIN";
	public static final String ROTATION_TAG_NAME = "ROTATION3D";

	private Point3D origin;
	private Rotation3D rotation;

	/**
	 * Creates a new instance.
	 */
	public PlaneData() {
		super();
		origin = new Point3D();
		rotation = new Rotation3D();
	}

    /**
     * Creates a new instance.
     * 
     * @param polygon
     *            The borders of the plane.
     */
    public PlaneData(RegionData region) {
        super(region);
        origin = new Point3D();
        rotation = new Rotation3D();
    }

	/**
	 * Creates a new instance.
	 * 
	 * @param polygon
	 *            The borders of the plane.
	 */
	public PlaneData(PrecisePolygon polygon) {
		super(polygon);
		origin = new Point3D();
		rotation = new Rotation3D();
	}

	/**
	 * Creates a new instance.
	 * 
	 * @param origin
	 *            The origin of the plane
	 * @param rotation
	 *            The rotation of the plane's axes to the coordinate system's
	 *            axes. The z-axis is the normal of the plane
	 * @param polygon
	 *            The borders of the plane defined in the x-y axes of the plane
	 */
	public PlaneData(Point3D origin, Rotation3D rotation, PrecisePolygon polygon) {
		super(polygon);
		this.origin = origin;
		this.rotation = rotation;
	}

	/**
	 * Creates a new instance.
	 * 
	 * @param polygon
	 *            The borders of the plane defined in the x-y axes of the plane
	 * @param scope
	 *            The scope of the coordinates.
	 */
	public PlaneData(PrecisePolygon polygon, Scope scope) {
		super(polygon, scope);
		origin = new Point3D();
		rotation = new Rotation3D();
	}

	/**
	 * Creates a new instance.
	 * 
	 * @param origin
	 *            The origin of the plane
	 * @param rotation
	 *            The rotation of the plane's axes to the coordinate system's
	 *            axes. The z-axis is the normal of the plane
	 * @param polygon
	 *            The borders of the plane defined in the x-y axes of the plane
	 * @param scope
	 *            The scope of the coordinates.
	 */
	public PlaneData(Point3D origin, Rotation3D rotation,
			PrecisePolygon polygon, Scope scope) {
		super(polygon, scope);
		this.origin = origin;
		this.rotation = rotation;
	}

	/**
	 * Creates a new instance.
	 * 
	 * @param origin
	 *            The origin of the plane
	 * @param rotation
	 *            The rotation of the plane's axes to the coordinate system's
	 *            axes. The z-axis is the normal of the plane
	 * @param scope
	 *            The scope of the coordinates.
	 */
	public PlaneData(Point3D origin, Rotation3D rotation, Scope scope) {
		super(scope);
		this.origin = origin;
		this.rotation = rotation;
	}

	/**
	 * Creates a new instance.
	 * 
	 * @param origin
	 *            The origin of the plane
	 * @param rotation
	 *            The rotation of the plane's axes to the coordinate system's
	 *            axes. The z-axis is the normal of the plane
	 */
	public PlaneData(Point3D origin, Rotation3D rotation) {
		super();
		this.origin = origin;
		this.rotation = rotation;
	}

	/**
	 * Getter for the plane's origin.
	 * 
	 * @return the plane's origin.
	 */
	public Point3D getOrigin() {
		return origin;
	}

	/**
	 * Setter for the plane's origin.
	 * 
	 * @param origin
	 *            the plane's origin.
	 */
	public void setOrigin(Point3D origin) {
		this.origin = origin;
	}

	/**
	 * Getter for the rotation of the plane's axes to the coordinate system.
	 * 
	 * @return the plane's rotation.
	 */
	public Rotation3D getRotation() {
		return rotation;
	}

	/**
	 * Setter for the rotation of the plane's axes to the coordinate system.
	 * 
	 * @param rotation
	 *            the plane's rotation.
	 */
	public void setRotation(Rotation3D rotation) {
		this.rotation = rotation;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "[" + getClass().getSimpleName() + " timestamp: " + getTimestamp()
				+ " scope: " + scope + " Origin: " + origin + " Rotation: "
				+ rotation + " Polygon: " + polygon + "]";

	}
}
