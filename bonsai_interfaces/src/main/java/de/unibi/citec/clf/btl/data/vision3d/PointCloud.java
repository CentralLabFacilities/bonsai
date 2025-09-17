package de.unibi.citec.clf.btl.data.vision3d;



import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.StampedType;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * This is a serializable pointcloud type.
 * 
 * @author plueckin
 */
@Deprecated
public class PointCloud extends StampedType {

	public static LengthUnit iLU = LengthUnit.MILLIMETER;

	private List<Point3D> points = new List<>(Point3D.class);
	private Point3D sensor_origin;
	private Rotation3D rotation;

	/**
	 * Copy-constructor.
	 * 
	 * @param c
	 *            The instance to create a copy from.
	 */
	public PointCloud(PointCloud pc) {

		for (Point3D point : pc.getPoints()) {
			this.points.add(new Point3D(point.getX(iLU), point.getY(iLU), point
					.getZ(iLU), iLU));
		}
		this.sensor_origin = pc.getSensorOrigin();
		this.rotation = pc.getRotation();
	}

	/**
	 * Constructor.
	 * 
	 * @param position
	 *            Center of the cloud.
	 * @param points
	 *            List of 3D Points building the cloud.
	 * @param sensor_origin
	 *            Origin of the sensor.
	 * @param sensor_rotation
	 *            Rotation of the sensor.
	 * @param height
	 *            Height of the cloud.
	 * @param width
	 *            Width of the cloud.
	 * @param depth
	 *            Approximate depth of the cloud.
	 * @param lengthUnit
	 *            Unit of the height and radius values.
	 */
	public PointCloud(List<Point3D> points,
			Point3D sensor_origin, Rotation3D sensor_rotation, double height,
			double width, double depth, LengthUnit lengthUnit) {
		
		for (Point3D point : points) {
			this.points.add(new Point3D(point.getX(iLU), point.getY(iLU), point
					.getZ(iLU), iLU));
		}
		this.sensor_origin = sensor_origin;
		this.rotation = sensor_rotation;
	}

	/**
	 * Default constructor.
	 */
	public PointCloud() {
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		String info = "[" + getClass().getSimpleName();
		info += " points=";
		for (Point3D p : points) {
			info += " " + p.toString();
		}
        info += ";";
		info += " sensor_origin=" + sensor_origin + ";";
		info += " rotation=" + rotation + ";";
		info += "]";
		return info;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public boolean equals(Object obj) {
		try {
			if (!(obj instanceof PointCloud))
				return false;

			PointCloud other = (PointCloud) obj;
			if (points.size() != other.getPoints().size()) {
				return false;
			}

			for (int i = 0; i < points.size(); i++) {
				if (!points.get(i).equals(other.getPoints().get(i))) {
					return false;
				}
			}
			return other.getRotation().equals(getRotation())
					&& other.getSensorOrigin().equals(getSensorOrigin());
		} catch (Exception e) {
			return false;
		}
	}

	/**
	 * Adds a {@link Point3D} to the pointcloud.
	 * 
	 * @param p
	 *            The {@link Point3D} instance to add.
	 */
	public void addPoint(Point3D point) {
		points.add(point);
	}
	
	public List<Point3D> getPoints() {
		return points;
	}

	public void setPoints(List<Point3D> points) {
		this.points = points;
	}

	public Rotation3D getRotation() {
		return rotation;
	}

	public void setRotation(Rotation3D rotation) {
		this.rotation = rotation;
	}

	public Point3D getSensorOrigin() {
		return sensor_origin;
	}

	public void setSensorOrigin(Point3D origin) {
		this.sensor_origin = origin;
	}
}
