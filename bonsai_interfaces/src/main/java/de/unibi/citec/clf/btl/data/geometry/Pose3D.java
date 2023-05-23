package de.unibi.citec.clf.btl.data.geometry;






import de.unibi.citec.clf.btl.Type;

import java.util.Objects;

public class Pose3D extends Type {
	
	private Point3D translation = new Point3D();
	private Rotation3D rotation = new Rotation3D();
	
	/**
	 * Creates a new instance.
	 */
	public Pose3D() {
		super();
	}

	/**
	 * Creates a new instance.
	 * 
	 * @param polygon
	 *            The borders of the plane.
	 */
	public Pose3D(Pose3D other) {
		super(other);
		setGenerator(other.getGenerator());
		setTimestamp(other.getTimestamp());
		translation = new Point3D(other.translation);
		rotation = new Rotation3D(other.rotation);
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
	public Pose3D(Point3D translation, Rotation3D rotation) {
		super();
		this.translation = translation;
		this.rotation = rotation;
	}

	public Pose3D(Point3D translation, Rotation3D rotation, String frameId) {
		super();
		this.translation = translation;
		this.rotation = rotation;
		this.frameId = frameId;
	}

	public Point3D getTranslation() {
		return translation;
	}

	public void setTranslation(Point3D translation) {
		this.translation = translation;
	}

	public Rotation3D getRotation() {
		return rotation;
	}

	public void setRotation(Rotation3D rotation) {
		this.rotation = rotation;
	}

	@Override
	public int hashCode() {

		return Objects.hash(super.hashCode(), translation, rotation);
	}

	@Override
	public boolean equals(Object obj) {
		if (obj instanceof Pose3D) {
			Pose3D other = (Pose3D) obj;
			return translation.equals(other.translation)
					&& rotation.equals(other.rotation);
		}
		return false;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "[" + getClass().getSimpleName() + " timestamp: " + getTimestamp() + " frameId: " + getFrameId()
				+ " Translation: " + translation + " Rotation: " + rotation + "]";

	}
}
