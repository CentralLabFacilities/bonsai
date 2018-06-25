package de.unibi.citec.clf.btl.data.grasp;





import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

public class PoseData extends Type {

	protected double x = 0;
	protected double y = 0;
	protected double z = 0;
	protected LengthUnit iLU= LengthUnit.MILLIMETER;

	/**
	 * Constructor.
	 */
	public PoseData() {
		super();
	}

	/**
	 * Constructor.
	 */
	public PoseData(double x, double y, double z, LengthUnit lU) {
		super();
		this.x = UnitConverter.convert(x, lU, iLU);
		this.y = UnitConverter.convert(y, lU, iLU);
		this.z = UnitConverter.convert(z, lU, iLU);

	}

	/**
	 * Returns the x-value of the endeffector position (mm)
	 * 
	 * @return x-value of the endeffector position
	 * 
	 * @parem lU
	 * 		desired length unit
	 */
	public double getX(LengthUnit lU) {
		return UnitConverter.convert(x, iLU, lU);
	}

	/**
	 * Sets the x-value of the endeffector position (mm)
	 * 
	 * @param x
	 *            x-value of the endeffector
	 * @parem lU
	 * 		input length unit
	 */
	public void setX(double x,LengthUnit lU) {
		this.x = UnitConverter.convert(x, lU, iLU);
	}

	/**
	 * Returns the y-value of the endeffector position (mm)
	 * 
	 * @return y-value of the endeffector position
	 * 
	 * @parem lU
	 * 		desired length unit
	 */
	public double getY(LengthUnit lU) {
		return UnitConverter.convert(y, iLU, lU);
	}

	/**
	 * Sets the y-value of the endeffector position (mm)
	 * 
	 * @param y
	 *            y-value of the endeffector
	 *            
	 * @parem lU
	 * 		input length unit
	 */
	public void setY(double y, LengthUnit lU) {
		this.y = UnitConverter.convert(y, lU, iLU);
	}

	/**
	 * Returns the z-value of the endeffector position (mm)
	 * 
	 * @return z-value of the endeffector position
	 * 
	 * @parem lU
	 * 		desired length unit
	 */
	public double getZ(LengthUnit lU) {
		return UnitConverter.convert(z, iLU, lU);
	}

	/**
	 * Sets the z-value of the endeffector position (mm)
	 * 
	 * @param z
	 *            z-value of the endeffector
	 * @parem lU
	 * 		input length unit
	 */
	public void setZ(double z,LengthUnit lU) {
		this.z = UnitConverter.convert(z, lU, iLU);
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "PoseData [x = " + x + ", y = " + y + ", z = " + z + "]";
	}

}
