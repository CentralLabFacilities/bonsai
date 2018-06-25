package de.unibi.citec.clf.btl.data.geometry;


import java.util.Objects;

public class PoseWithConfidence3D extends Pose3D {

	protected double transConf = 1;
	protected double rotConf = 1;

	/**
	 * Creates a new instance.
	 */
	public PoseWithConfidence3D() {
		super();
	}

	/**
	 * Creates a new instance.
	 * 
	 * @param polygon
	 *            The borders of the plane.
	 */
	public PoseWithConfidence3D(PoseWithConfidence3D other) {
		super();
		setGenerator(other.getGenerator());
		setTimestamp(other.getTimestamp());
		transConf = other.transConf;
		rotConf = other.rotConf;
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
	public PoseWithConfidence3D(Point3D translation, Rotation3D rotation,
			double transConf, double rotConf) {
		super(translation, rotation);
		this.transConf = transConf;
		this.rotConf = rotConf;
	}

	public double getTranslationConfidence() {
		return transConf;
	}

	public void setTranslationConfidence(double translation) {
		this.transConf = translation;
	}

	public double getRotationConfidence() {
		return rotConf;
	}

	public void setRotationConfidence(double rotation) {
		this.rotConf = rotation;
	}

	@Override
	public boolean equals(Object o) {
		if (this == o) return true;
		if (!(o instanceof PoseWithConfidence3D)) return false;
		if (!super.equals(o)) return false;
		PoseWithConfidence3D that = (PoseWithConfidence3D) o;
		return Double.compare(that.transConf, transConf) == 0 &&
				Double.compare(that.rotConf, rotConf) == 0;
	}

	@Override
	public int hashCode() {
		return Objects.hash(super.hashCode(), transConf, rotConf);
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "[" + getClass().getSimpleName() + " timestamp: " + getTimestamp()
				+ " Translation: " + super.getTranslation() + "(conf: "
				+ transConf + ") Rotation: " + super.getRotation() + "(conf: "
				+ rotConf + ")]";

	}
}
