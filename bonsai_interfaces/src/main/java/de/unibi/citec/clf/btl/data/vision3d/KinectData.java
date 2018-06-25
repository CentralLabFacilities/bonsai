package de.unibi.citec.clf.btl.data.vision3d;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

public class KinectData extends Type {

	public static final String TILT_TAG_NAME = "TILT";
	public static final String ACCELERATION_TAG_NAME = "ACCELERATION";

	protected double tiltAngle;
	protected double accelerationX;
	protected double accelerationY;
	protected double accelerationZ;

	public KinectData() {
		super();
	}

	public void setTilt(double tilt, AngleUnit unit) {
		this.tiltAngle = UnitConverter.convert(tilt, unit, AngleUnit.RADIAN);
	}

	public double getTilt(AngleUnit unit) {
		return UnitConverter.convert(tiltAngle, AngleUnit.RADIAN, unit);
	}

	public void setAcceleration(double accX, double accY, double accZ) {
		this.accelerationX = accX;
		this.accelerationY = accY;
		this.accelerationZ = accZ;
	}

	public double getAccelerationX() {
		return accelerationX;
	}

	public double getAccelerationY() {
		return accelerationY;
	}

	public double getAccelerationZ() {
		return accelerationZ;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "[" + getClass().getSimpleName() + " timestamp: " + getTimestamp() + " tilt: "
				+ tiltAngle + " acceleration: " + accelerationX + ", "
				+ accelerationY + ", " + accelerationZ + "]";

	}
}
