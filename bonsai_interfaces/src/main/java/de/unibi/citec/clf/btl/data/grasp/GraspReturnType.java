package de.unibi.citec.clf.btl.data.grasp;






import de.unibi.citec.clf.bonsai.actuators.GraspActuator;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * This class represents a point in space by all 3 dimensions.
 * 
 * @author lziegler
 */
public class GraspReturnType extends Type {

	/**
	 * Scope of the coordinates.
	 * 
	 * @author semeyerz
	 */
	public enum GraspResult {
		SUCCESS, POSITION_UNREACHABLE, ROBOT_CRASHED, FAIL, COLLISION_HANDLED, NO_RESULT
	}

    // coordinates in millimeters
	protected double x;
	protected double y;
	protected double z;
	protected double rating;
	protected GraspResult gr = GraspResult.NO_RESULT;

	/**
	 * Creates instance.
	 */
	public GraspReturnType() {
	}

	/**
	 * Creates instance.
	 * 
	 * @param x
	 *            first value
	 * @param y
	 *            second value
	 * @param z
	 *            third value
	 * @param internalUnit
	 *            unit of the values
	 */
	public GraspReturnType(GraspResult gr) {
		this.gr = gr;
	}

	/**
	 * Creates instance.
	 * 
	 * @param x
	 *            first value
	 * @param y
	 *            second value
	 * @param z
	 *            third value
	 * @param unit
	 *            unit of the values
	 * @param scope
	 *            the scope of the coordinates.
	 */
	public GraspReturnType(double x, double y, double z, LengthUnit unit, double rating, GraspResult gr, String frameId) {
		setX(x, unit);
		setY(y, unit);
		setZ(z, unit);
		this.rating = rating;
		this.gr = gr;
		this.setFrameId(frameId);
	}

	public GraspActuator.MoveitResult toMoveitResult() {
		return (getGraspResult()==GraspResult.SUCCESS) ? GraspActuator.MoveitResult.SUCCESS : GraspActuator.MoveitResult.FAILURE;
	}

	public double getX(LengthUnit unit) {
		return UnitConverter.convert(x, LengthUnit.MILLIMETER, unit);
	}

	public void setX(double x, LengthUnit unit) {
		this.x = UnitConverter.convert(x, unit, LengthUnit.MILLIMETER);
	}

	public double getY(LengthUnit unit) {
		return UnitConverter.convert(y, LengthUnit.MILLIMETER, unit);
	}

	public void setY(double y, LengthUnit unit) {
		this.y = UnitConverter.convert(y, unit, LengthUnit.MILLIMETER);
	}

	public double getZ(LengthUnit unit) {
		return UnitConverter.convert(z, LengthUnit.MILLIMETER, unit);
	}

	public void setZ(double z, LengthUnit unit) {
		this.z = UnitConverter.convert(z, unit, LengthUnit.MILLIMETER);
	}
	
	public double getRating() {
		return rating;
	}

	public void setRating(double rating) {
		this.rating = rating;
	}

	public GraspResult getGraspResult() {
		return gr;
	}

	public void setGraspResult(GraspResult gr) {
		this.gr = gr;
	}

	@Override
	public boolean equals(Object obj) {
		try {
			if (!(obj instanceof GraspReturnType))
				return false;

			GraspReturnType other = (GraspReturnType) obj;

			if (other.getX(LengthUnit.MILLIMETER) != getX(LengthUnit.MILLIMETER))
				return false;
			if (other.getY(LengthUnit.MILLIMETER) != getY(LengthUnit.MILLIMETER))
				return false;
			if (other.getZ(LengthUnit.MILLIMETER) != getZ(LengthUnit.MILLIMETER))
				return false;
			if (other.getRating() != rating)
				return false;
			if (other.getGraspResult() != gr)
				return false;

		} catch (Exception e) {
			return false;
		}
		return true;
	}

	@Override
	public String toString() {
		return "[" + getClass().getSimpleName() + " x=" + x + " y=" + y + " z=" + z + " rating=" + rating
				+ " type=" + gr+ " ("+gr.name() + ")]";
	}
}
