package de.unibi.citec.clf.btl.data.grasp;





import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

public class KatanaPoseData extends Type {

	protected double x = 0;
	protected double y = 0;
	protected double z = 0;
	protected double phi = 0;
	protected double psi = 0;
	protected double theta = 0;
	protected LengthUnit iLU = LengthUnit.MILLIMETER;
	protected AngleUnit iAU = AngleUnit.RADIAN;

	/**
	 * Constructor.
	 */
	public KatanaPoseData() {
		super();
	}

	/**
	 * Constructor.
	 */
	public KatanaPoseData(double x, double y, double z, double phi, double psi,
			double theta,AngleUnit aU, LengthUnit lU, String frameId) {
		super();
		this.x = UnitConverter.convert(x, lU, iLU);
		this.y = UnitConverter.convert(y, lU, iLU);
		this.z = UnitConverter.convert(z, lU, iLU);
		this.psi = UnitConverter.convert(psi, aU, iAU);
		this.phi = UnitConverter.convert(phi, aU, iAU);
		this.theta = UnitConverter.convert(theta, aU, iAU);
		this.setFrameId(frameId);
	}

	/**
	 * Constructor.
	 */
	public KatanaPoseData(KatanaPoseData kpd) {
		super(kpd);
		this.x = kpd.x;
		this.y = kpd.y;
		this.z = kpd.z;
		this.psi = kpd.psi;
		this.phi = kpd.phi;
		this.theta = kpd.theta;
	}

	/**
	 * Returns the x-value of the endeffector position (mm)
	 * 
	 * @return x-value of the endeffector position
	 */
	public double getX(LengthUnit lU) {
		return UnitConverter.convert(x, iLU, lU);
	}

	/**
	 * Sets the x-value of the endeffector position (mm)
	 * 
	 * @param x
	 *            x-value of the endeffector
	 */
	public void setX(double x,LengthUnit lU) {
		this.x = UnitConverter.convert(x, lU, iLU);
	}

	/**
	 * Returns the y-value of the endeffector position (mm)
	 * 
	 * @return y-value of the endeffector position
	 */
	public double getY(LengthUnit lU) {
		return UnitConverter.convert(y, iLU, lU);
	}

	/**
	 * Sets the y-value of the endeffector position (mm)
	 * 
	 * @param y
	 *            y-value of the endeffector
	 */
	public void setY(double y,LengthUnit lU) {
		this.y = UnitConverter.convert(y, lU, iLU);
	}

	/**
	 * Returns the z-value of the endeffector position (mm)
	 * 
	 * @return z-value of the endeffector position
	 */
	public double getZ(LengthUnit lU) {
		return UnitConverter.convert(z, iLU, lU);
	}

	/**
	 * Sets the z-value of the endeffector position (mm)
	 * 
	 * @param z
	 *            z-value of the endeffector
	 */
	public void setZ(double z,LengthUnit lU) {
		this.z = UnitConverter.convert(z, lU, iLU);
	}

	/**
	 * Returns the phi-value of the endeffector position (mm)
	 * 
	 * @return phi-value of the endeffector position
	 */
	public double getPhi(AngleUnit aU) {
		return UnitConverter.convert(phi, iAU, aU);
	}

	/**
	 * Sets the phi-value of the endeffector position (rad)
	 * 
	 * @param phi
	 *            phi-value of the endeffector
	 */
	public void setPhi(double phi,AngleUnit aU) {
		this.phi = UnitConverter.convert(phi, aU, iAU);
	}

	/**
	 * Returns the psi-value of the endeffector position (mm)
	 * 
	 * @return psi-value of the endeffector position
	 */
	public double getPsi(AngleUnit aU) {
		return UnitConverter.convert(psi, iAU, aU);
	}

	/**
	 * Sets the psi-value of the endeffector position (rad)
	 * 
	 * @param psi
	 *            psi-value of the endeffector
	 */
	public void setPsi(double psi,AngleUnit aU) {
		this.psi = UnitConverter.convert(psi, aU, iAU);
	}

	/**
	 * Returns the theta-value of the endeffector position (rad)
	 * 
	 * @return theta-value of the endeffector position
	 */
	public double getTheta(AngleUnit aU) {
		return UnitConverter.convert(theta, iAU, aU);
	}

	/**
	 * Sets the theta-value of the endeffector position (rad)
	 * 
	 * @param theta
	 *            theta-value of the endeffector
	 */
	public void setTheta(double theta,AngleUnit aU) {
		this.theta = UnitConverter.convert(theta, aU, iAU);
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "KatanaPoseData [x = " + x + ", y = " + y + ", z = " + z
				+ ", phi = " + phi + ", psi = " + psi + ", theta = " + theta + ", frame = " + getFrameId()
				+ "]";
	}

}
