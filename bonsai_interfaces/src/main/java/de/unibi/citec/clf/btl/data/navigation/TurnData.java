package de.unibi.citec.clf.btl.data.navigation;



import de.unibi.citec.clf.btl.StampedType;
import org.apache.log4j.Logger;

import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.common.MicroTimestamp;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * This class is used to send direct linear turn commands (angle and speed).
 * 
 * @author lziegler
 * @author unknown
 */
public class TurnData extends StampedType {

	private static Logger logger = Logger.getLogger(TurnData.class);

	protected double speed = 0.0;
	protected double angle;
	protected MicroTimestamp readTime = new MicroTimestamp();

	public static RotationalSpeedUnit iSU = RotationalSpeedUnit.RADIANS_PER_SEC;
	public static AngleUnit iAU = AngleUnit.RADIAN;

        
        public TurnData() {
            super();
        }
        
        public TurnData(double angle, AngleUnit angleUnit, double speed, RotationalSpeedUnit speedUnit) {
            super();
            setAngle(angle, angleUnit);
            setSpeed(speed, speedUnit);
        }
        
	/**
	 * @return the rotational Speed[RotationalSpeedUnit]
	 */
	public double getSpeed(RotationalSpeedUnit u) {
		return UnitConverter.convert(speed, iSU, u);
	}

	/**
	 * Sets the rotational speed.
	 * 
	 * @param speed
	 *            rotational speed in [RotationalSpeedUnit]
	 */
	public void setSpeed(double speed, RotationalSpeedUnit u) {
		this.speed = UnitConverter.convert(speed, u, iSU);
	}
	
	/**
	 * @return the distance [LengthUnit].
	 */
	public double getAngle(AngleUnit u) {
		return UnitConverter.convert(angle, iAU, u);
	}

	/**
	 * Sets the distance.
	 * 
	 * @param distance
	 *            distance in [LengthUnit]
	 */
	public void setAngle(double angle, AngleUnit u) {
		this.angle = UnitConverter.convert(angle, u, iAU);
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		StringBuilder strb = new StringBuilder();
		strb.append("#TURN# ");
		strb.append("timestamp: " + getTimestamp() + "; ");
		strb.append("angle: " + angle + "; ");
		strb.append("speed: " + speed + ";");
		return strb.toString();
	}
}
