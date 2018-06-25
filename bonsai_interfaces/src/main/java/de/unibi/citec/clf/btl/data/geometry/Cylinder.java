package de.unibi.citec.clf.btl.data.geometry;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * This is a serializable cylinder type.
 * 
 * @author lziegler
 */
public class Cylinder extends Type {

	private static LengthUnit internalLengthUnit = LengthUnit.MILLIMETER;

	protected Point3D position;
	protected Rotation3D orientation;
	protected double height;
	protected double radius;

	/**
	 * Copy-constructor.
	 * 
	 * @param c
	 *            The instance to create a copy from.
	 */
	public Cylinder(Cylinder c) {

		this.position = new Point3D(c.getPosition().getX(internalLengthUnit), c
				.getPosition().getY(internalLengthUnit), c.getPosition().getZ(
				internalLengthUnit), internalLengthUnit);
		this.orientation = c.getOrientation();
		this.radius = c.getRadius(internalLengthUnit);
		this.height = c.getHeight(internalLengthUnit);
	}

	/**
	 * Constructor.
	 * 
	 * @param position
	 *            Center of the cylinder.
	 * @param rotationX
	 *            Rotation of the cylinder's axis around x-axis.
	 * @param rotationY
	 *            Rotation of the cylinder's axis around y-axis.
	 * @param rotationZ
	 *            Rotation of the cylinder's axis around z-axis.
	 * @param angleUnit
	 *            Unit of the given rotation angles.
	 * @param height
	 *            Height of the cylinder.
	 * @param radius
	 *            Radius of the cylinder.
	 * @param lengthUnit
	 *            Unit of the height and radius values.
	 */
	public Cylinder(Point3D position, Rotation3D direction, double height,
			double radius, LengthUnit lengthUnit) {
		this.position = position;
		this.orientation = direction;
		this.height = UnitConverter.convert(height, lengthUnit,
				internalLengthUnit);
		this.radius = UnitConverter.convert(radius, lengthUnit,
				internalLengthUnit);
	}

	/**
	 * Default constructor.
	 */
	public Cylinder() {
		this.position = new Point3D();
		this.orientation = new Rotation3D();
		this.height = 0;
		this.radius = 0;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		String info = "[" + getClass().getSimpleName();
		info += " position=" + position;
		info += " orientation=" + orientation;
		info += " height=" + height;
		info += " radius=" + radius;
		info += "]";
		return info;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public boolean equals(Object obj) {
		try {
			if (!(obj instanceof Cylinder))
				return false;

			Cylinder other = (Cylinder) obj;

			return other.getPosition().equals(position)
					&& other.getOrientation().equals(getOrientation())
					&& other.getHeight(internalLengthUnit) == getHeight(internalLengthUnit)
					&& other.getRadius(internalLengthUnit) == getRadius(internalLengthUnit);
		} catch (Exception e) {
			return false;
		}
	}

	public Point3D getPosition() {
		return position;
	}

	public void setPosition(Point3D position) {
		this.position = position;
	}

	public Rotation3D getOrientation() {
		return orientation;
	}

	public void setOrientation(Rotation3D orientation) {
		this.orientation = orientation;
	}

	public double getRadius(LengthUnit unit) {
		return UnitConverter.convert(radius, internalLengthUnit, unit);
	}

	public void setRadius(double radius, LengthUnit unit) {
		this.radius = UnitConverter.convert(radius, unit, internalLengthUnit);
	}

	public double getHeight(LengthUnit unit) {
		return UnitConverter.convert(height, internalLengthUnit, unit);
	}

	public void setHeight(double height, LengthUnit unit) {
		this.height = UnitConverter.convert(height, unit, internalLengthUnit);
	}
}
