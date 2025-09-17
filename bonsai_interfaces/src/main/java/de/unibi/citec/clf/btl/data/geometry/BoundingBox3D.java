package de.unibi.citec.clf.btl.data.geometry;



import de.unibi.citec.clf.btl.StampedType;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.util.Objects;

public class BoundingBox3D extends StampedType {

	protected Pose3D pose = new Pose3D();
	protected Point3D size = new Point3D();
	
	/**
	 * Creates a new instance.
	 */
	public BoundingBox3D() {
		super();
	}


	/**
	 * clone a new instance.
	 *
	 * @param other
	 *            The borders of the plane.
	 */
	public BoundingBox3D(BoundingBox3D other) {
		super();
		setGenerator(other.getGenerator());
		setTimestamp(other.getTimestamp());
		size = new Point3D(other.size);
		pose = new Pose3D(other.pose);
	}

	/**
	 * Creates a new instance.
	 * 
	 * @param pose
	 *            The origin of the plane and the rotation of the plane's axes
	 *            to the coordinate system's axes. The z-axis is the normal of
	 *            the plane
	 * @param size
	 *            The borders of the plane defined in the x-y axes of the plane
	 */
	public BoundingBox3D(Pose3D pose, Point3D size) {
		super();
		this.size = size;
		this.pose = pose;
	}

	public Pose3D getPose() {
		return pose;
	}

	public void setPose(Pose3D origin) {
		this.pose = origin;
	}

	public Point3D getSize() {
		return size;
	}

	public void setSize(Point3D size) {
		this.size = size;
	}

	public double volume(LengthUnit lu) {
		return size.getX(lu) * size.getY(lu) * size.getZ(lu);
	}

	@Override
	public boolean equals(Object obj) {
		if (obj instanceof BoundingBox3D) {
			BoundingBox3D other = (BoundingBox3D) obj;
			return size.equals(other.size) && pose.equals(other.pose);
		}
		return false;
	}

	@Override
	public int hashCode() {
		return Objects.hash(super.hashCode(), pose, size);
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "[" + getClass().getSimpleName() + " timestamp: " + getTimestamp() + " Posture: "
				+ pose + " Size: " + size + "]";

	}
}
