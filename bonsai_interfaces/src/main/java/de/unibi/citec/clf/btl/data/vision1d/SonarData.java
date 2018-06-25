package de.unibi.citec.clf.btl.data.vision1d;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * This class is used to store data from the sonar sensors from nao. It holds
 * the distances to objects in front of the left or right sensor.
 * 
 * @author sebschne
 */
public class SonarData extends Type {

	private double distanceRight;
	private double distanceLeft;
	private LengthUnit iLU = LengthUnit.MILLIMETER;
	
	public SonarData() {
    }

	public SonarData(double distanceRight, double distanceLeft,LengthUnit lU) {
		super();
		this.distanceRight = UnitConverter.convert(distanceRight,lU,iLU);
		this.distanceLeft = UnitConverter.convert(distanceLeft,lU,iLU);
	}

	/**
	 * 
	 * @return the observed distance to an object in front of the right sonar
	 *         sensor.
	 */
	public double getDistanceRight(LengthUnit lU) {
		return UnitConverter.convert(distanceRight, iLU,lU);
	}

	/**
	 * 
	 * @return the observed distance to an object in front of the left sonar
	 *         sensor.
	 */
	public double getDistanceLeft(LengthUnit lU) {
		return UnitConverter.convert(distanceLeft, iLU,lU);
	}

	public void setDistanceRight(double distanceRight,LengthUnit lU) {
		this.distanceRight = UnitConverter.convert(distanceRight, lU, iLU);
	}

	public void setDistanceLeft(double distanceLeft,LengthUnit lU) {
		this.distanceLeft = UnitConverter.convert(distanceLeft, lU, iLU);
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {

		return "Created: " + getTimestamp() + " Distance left:  "
				+ getDistanceLeft(LengthUnit.MILLIMETER) + " Distance right " + getDistanceRight(LengthUnit.MILLIMETER);

	}

}
