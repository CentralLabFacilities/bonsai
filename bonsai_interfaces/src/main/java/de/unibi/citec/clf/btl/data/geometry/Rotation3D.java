package de.unibi.citec.clf.btl.data.geometry;



import javax.vecmath.AxisAngle4d;
import javax.vecmath.Matrix3d;
import javax.vecmath.Quat4d;
import javax.vecmath.Vector3d;

import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * This is a generic rotation type. It can be set and read using several
 * representation formats.
 * 
 * @author lziegler
 */
public class Rotation3D extends Type {

	protected Matrix3d mat = new Matrix3d();

	/**
	 * Creates a default rotation object (no rotation).
	 */
	public Rotation3D() {
		mat.setIdentity();
	}

	/**
	 * Create rotation object from axis/angle representation.
	 * 
	 * @param x
	 *            First component of the axis.
	 * @param y
	 *            Second component of the axis.
	 * @param z
	 *            Third component of the axis.
	 * @param angle
	 *            Rotation angle around the defined axis.
	 * @param angleUnit
	 *            Unit of the defined angle.
	 */
	public Rotation3D(double x, double y, double z, double angle,
			AngleUnit angleUnit) {

		AxisAngle4d rot = new AxisAngle4d(x, y, z, UnitConverter.convert(angle,
				angleUnit, AngleUnit.RADIAN));
		mat.set(rot);
	}

	/**
	 * Create rotation object from axis/angle representation.
	 * 
	 * @param axis
	 *            The axis as vecmath object.
	 * @param angle
	 *            Rotation angle around the defined axis.
	 * @param angleUnit
	 *            Unit of the defined angle.
	 * @see #Rotation3D(double, double, double, double, AngleUnit)
	 */
	public Rotation3D(Vector3d axis, double angle, AngleUnit angleUnit) {

		AxisAngle4d rot = new AxisAngle4d(axis, UnitConverter.convert(angle,
				angleUnit, AngleUnit.RADIAN));
		mat.set(rot);
	}

	/**
	 * Create rotation object from axis/angle representation.
	 * 
	 * @param rotation
	 *            The rotation as vecmath object.
	 */
	public Rotation3D(AxisAngle4d rotation) {
		mat.set(rotation);
	}

	/**
	 * Create rotation object from quaternion representation.
	 * 
	 * @param rotation
	 *            The rotation as vecmath object.
	 */
	public Rotation3D(Quat4d rotation) {
		mat.set(rotation);
	}

	/**
	 * Create rotation object from euler angles.
	 * 
	 * @param heading
	 *            first rotation (azimuth, yaw, theta)
	 * @param attitude
	 *            second rotation (elevation, pitch, phi)
	 * @param bank
	 *            third rotation (tilt, psi, roll)
	 * @param angleUnit
	 *            Unit of the rotations
	 */
	public Rotation3D(double heading, double attitude, double bank,
			AngleUnit angleUnit) {

		setEuler(heading, attitude, bank, angleUnit);
	}

	/**
	 * Create rotation object from euler angles.
	 * 
	 * @param vec
	 *            A vector containing the angles for heading, attitude and bank.
	 * @param angleUnit
	 *            Unit of the rotations
	 * @see #Rotation3D(double, double, double, AngleUnit)
	 */
	public Rotation3D(Vector3d vec, AngleUnit angleUnit) {
		this(vec.x, vec.y, vec.z, angleUnit);
	}

	/**
	 * Create rotation object from rotation matrix.
	 * 
	 * @param mat
	 *            The rotation matrix.
	 */
	public Rotation3D(Matrix3d mat) {
		this.mat = mat;
	}

	/**
	 * Copy constructor.
	 * 
	 * @param rotation
	 */
	public Rotation3D(Rotation3D rotation) {
		super(rotation);
		mat = new Matrix3d(rotation.mat);
	}

	public Rotation3D(Vector3d vector3d, double yaw, AngleUnit radian, String frameId) {
		this(vector3d,yaw,radian);
		setFrameId(frameId);
	}

	/**
	 * Returns the rotation in matrix representation.
	 * 
	 * @return The rotation matrix.
	 */
	public Matrix3d getMatrix() {
		return mat;
	}

	/**
	 * Returns the rotation in quaternion representation.
	 * 
	 * @return A vecmath object containing the rotation values.
	 */
	public Quat4d getQuaternion() {
		Quat4d q = new Quat4d();
		q.set(mat);
		return q;
	}

	/**
	 * Returns the rotation in axis/angle representation.
	 * 
	 * @param unit
	 *            The desired unit of the rotaion angle.
	 * @return A vecmath object representing the rotation values.
	 */
	public AxisAngle4d getAxisAngle(AngleUnit unit) {
		AxisAngle4d a = new AxisAngle4d();
		a.set(mat);
		a.angle = UnitConverter.convert(a.angle, AngleUnit.RADIAN, unit);
		return a;
	}

	/**
	 * Returns the rotation in euler angles representation.
	 * 
	 * @param unit
	 *            The desired unit of the angles.
	 * @return A vector object containing the rotation angles. Where: <br/>
	 *         first value = tilt, psi, roll (around x-axis)<br/>
	 *         second value = elevation, pitch, phi (around y-axis)<br/>
	 *         third value = azimuth, yaw, theta (around z-axis)
	 */
	public Vector3d getEuler(AngleUnit unit) {

		// Algorithm from here:
		// http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToEuler/index.htm

		double attitude, heading, bank;

		if (mat.m10 > 0.99999) {
			// singularity at north pole
			attitude = Math.atan2(mat.m02, mat.m22);
			heading = Math.PI / 2.0;
			bank = 0.0;
		} else if (mat.m10 < -0.99999) {
			// singularity at south pole
			attitude = Math.atan2(mat.m02, mat.m22);
			heading = -Math.PI / 2.0;
			bank = 0.0;
		} else {
			attitude = Math.atan2(-mat.m20, mat.m00);
			bank = Math.atan2(-mat.m12, mat.m11);
			heading = Math.asin(mat.m10);
		}

		attitude = UnitConverter.convert(attitude, AngleUnit.RADIAN, unit);
		bank = UnitConverter.convert(bank, AngleUnit.RADIAN, unit);
		heading = UnitConverter.convert(heading, AngleUnit.RADIAN, unit);

		return new Vector3d(bank, attitude, heading);
	}

	/**
	 * Get the yaw part of the rotation, assuming z axis points up.
	 * 
	 * @param unit
	 *            The desired unit of the returned angle.
	 * @return The yaw value in the desired unit.
	 */
	public double getYaw(AngleUnit unit) {
	    double yaw = MathTools.zRotationFromMatrix(mat);
            return UnitConverter.convert(yaw, AngleUnit.RADIAN, unit);
	}

	/**
	 * Set rotation from axis/angle representation.
	 * 
	 * @param x
	 *            First component of the axis.
	 * @param y
	 *            Second component of the axis.
	 * @param z
	 *            Third component of the axis.
	 * @param angle
	 *            Rotation angle around the defined axis.
	 * @param angleUnit
	 *            Unit of the defined angle.
	 */
	public void setAxisAngle(double x, double y, double z, double angle,
			AngleUnit angleUnit) {

		AxisAngle4d rot = new AxisAngle4d(x, y, z, UnitConverter.convert(angle,
				angleUnit, AngleUnit.RADIAN));
		mat.set(rot);
	}

	/**
	 * Set rotation from axis/angle representation.
	 * 
	 * @param axis
	 *            The axis as vecmath object.
	 * @param angle
	 *            Rotation angle around the defined axis.
	 * @param angleUnit
	 *            Unit of the defined angle.
	 * @see #Rotation3D(double, double, double, double, AngleUnit)
	 */
	public void setAxisAngle(Vector3d axis, double angle, AngleUnit angleUnit) {

		AxisAngle4d rot = new AxisAngle4d(axis, UnitConverter.convert(angle,
				angleUnit, AngleUnit.RADIAN));
		mat.set(rot);
	}

	/**
	 * Set rotation from axis/angle representation.
	 * 
	 * @param rotation
	 *            The rotation as vecmath object.
	 */
	public void setAxisAngle(AxisAngle4d rotation) {
		mat.set(rotation);
	}

	/**
	 * Set rotation from quaternion representation.
	 * 
	 * @param rotation
	 *            The rotation as vecmath object.
	 */
	public void setQuaternion(Quat4d rotation) {
		mat.set(rotation);
	}
	
	/**
	 * Set rotation from quaternion representation.
	 * 
	 * @param rotation
	 *            The rotation as vecmath object.
	 */
	public void setQuaternion(double x, double y, double z, double w) {
		Quat4d rotation = new Quat4d(x,y,z,w);
		mat.set(rotation);
	}


	/**
	 * Set rotation from euler angles.
	 * 
	 * @param heading
	 *            first rotation (azimuth, yaw, theta)
	 * @param attitude
	 *            second rotation (elevation, pitch, phi)
	 * @param bank
	 *            third rotation (tilt, psi, roll)
	 * @param angleUnit
	 *            Unit of the rotations
	 */
	public void setEuler(double heading, double attitude, double bank,
			AngleUnit angleUnit) {

		// Algorithm from here:
		// http://www.euclideanspace.com/maths/geometry/rotations/conversions/eulerToMatrix/index.htm

		double h = UnitConverter.convert(heading, angleUnit, AngleUnit.RADIAN);
		double a = UnitConverter.convert(attitude, angleUnit, AngleUnit.RADIAN);
		double b = UnitConverter.convert(bank, angleUnit, AngleUnit.RADIAN);

		double ch = Math.cos(h);
		double sh = Math.sin(h);
		double ca = Math.cos(a);
		double sa = Math.sin(a);
		double cb = Math.cos(b);
		double sb = Math.sin(b);

		double[] values = new double[9];
		values[0] = ch * ca;
		values[1] = sh * sb - ch * sa * cb;
		values[2] = ch * sa * sb + sh * cb;
		values[3] = sa;
		values[4] = ca * cb;
		values[5] = -ca * sb;
		values[6] = -sh * ca;
		values[7] = sh * sa * cb + ch * sb;
		values[8] = -sh * sa * sb + ch * cb;

		mat.set(values);
	}

	/**
	 * Set rotation from euler angles.
	 * 
	 * @param vec
	 *            A vector containing the angles for heading, attitude and bank.
	 * @param angleUnit
	 *            Unit of the rotations
	 * @see #setEuler(double, double, double, AngleUnit)
	 */
	public void setEuler(Vector3d vec, AngleUnit angleUnit) {
		setEuler(vec.x, vec.y, vec.z, angleUnit);
	}

	/**
	 * Set rotation from matrix.
	 * 
	 * @param mat
	 *            The rotation matrix.
	 */
	public void setMatrix(Matrix3d mat) {
		this.mat = mat;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		String info = "[" + getClass().getSimpleName();
		info += " matrix=" + mat.m00 + ", " + mat.m01 + ", " + mat.m02;
		info += ", " + mat.m10 + ", " + mat.m11 + ", " + mat.m12;
		info += ", " + mat.m20 + ", " + mat.m21 + ", " + mat.m22;
		info += " frame=" + getFrameId();
		info += "]";
		return info;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public boolean equals(Object obj) {
		try {
			if (!(obj instanceof Rotation3D))
				return false;

			Rotation3D other = (Rotation3D) obj;

			return other.mat.equals(mat);
		} catch (Exception e) {
			return false;
		}
	}

}
