package de.unibi.citec.clf.btl.data.navigation;



import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.TimeUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

import java.util.Objects;

public class NavigationGoalData extends PositionData {

	private double coordinateTolerance = 7.0;
	private double yawTolerance = 0.15;
	public static final LengthUnit iLU = LengthUnit.CENTIMETER;
	public static final AngleUnit iAU = AngleUnit.RADIAN;

	/**
	 * Constructs a new navigation goal. This is either achieved using just
	 * local obstacle avoidance or using a global navigation planner, depending
	 * on the type.
	 * 
	 * @param generator
	 *            generator of this data
	 * @param x
	 *            The x coordinate of this goal. World coordinates [m].
	 * @param y
	 *            The y coordinate of this goal. World coordinates [m].
	 * @param yaw
	 *            The yaw (orientation) of this goal [rad].
	 * @param coordinateTolerance
	 *            How close we have to get to the goal to "reach" it [m].
	 * @param yawTolerance
	 *            How close we have to get to the target orientation to "reach"
	 *            it [rad].
	 * @param frame
	 *            The method used to achieve reaching this goal (GLOBAL or
	 *            LOCAL).
	 * @param aU  
	 * 			  Angle unit of yaw and yawTolerance input
	 * @param lU
	 * 			  Length unit of x,y and coordinateTolerance input
	 * @see de.unibi.citec.clf.btl.data.navigation.PositionData.ReferenceFrame
	 */
	public NavigationGoalData(String generator, double x, double y, double yaw,
			double coordinateTolerance, double yawTolerance, ReferenceFrame frame, LengthUnit lU, AngleUnit aU) {

		super(x, y, yaw, Time.currentTimeMillis(),lU,aU, TimeUnit.MILLISECONDS);

		setGenerator(generator);

		this.coordinateTolerance = UnitConverter.convert(coordinateTolerance, lU, iLU);
		this.yawTolerance = UnitConverter.convert(yawTolerance, aU, iAU);
		setFrameId(frame);
	}

	/**
	 * is deprecated because navigationGoalData is a subclass of positionData, please just cast instead
	 * e.g. with this:
	 * PositionData posi = ...;
	 * NavigationGoalData goal = NavagationGoalData(posi);
	 * how you should use it:
	 * PositionData posi = ...;
	 * NavigationGoalData goal = (NavagationGoalData) posi;
	 * @param positionData
	 */
	public NavigationGoalData(PositionData positionData) {
		super(positionData);
	}

	/**
	 * Constructs a new navigation goal. This is either achieved using just
	 * local obstacle avoidance or using a global navigation planner, depending
	 * on the type.
	 * 
	 * @param generator
	 *            the generator of the data
	 * @param x
	 *            The x coordinate of this goal. World coordinates [m].
	 * @param y
	 *            The y coordinate of this goal. World coordinates [m].
	 * @param yaw
	 *            The yaw (orientation) of this goal [rad].
	 * @param frame
	 *            The method used to achieve reaching this goal (GLOBAL or
	 *            LOCAL).
	 * @param aU  
	 * 			  Angle unit of yaw input
	 * @param lU
	 * 			  Length unit of x,y input
	 * @see de.unibi.citec.clf.btl.data.navigation.PositionData.ReferenceFrame
	 */
	public NavigationGoalData(String generator, double x, double y, double yaw,
			ReferenceFrame frame, LengthUnit lU,AngleUnit aU) {
		this(generator, x, y, yaw, 0.25, Math.PI * 2, frame,lU,aU);
	}

	/**
	 * Constructor, sets X, Y and Yaw as 0.0, CoordinateTolerance as 0.1,
	 * yawTolerance as 2PI and the type as GLOBAL.
	 */
	public NavigationGoalData() {
		this("javabtl", 0.0, 0.0, 0.0, ReferenceFrame.GLOBAL, LengthUnit.METER,AngleUnit.RADIAN);
	}

	/**
	 * @return the coordinateTolerance[m] of the goal.
	 * 
	 * @param lU length unit
	 */
	public double getCoordinateTolerance(LengthUnit lU) {
		return UnitConverter.convert(coordinateTolerance, iLU, lU);
	}

	/**
	 * @return the yawTolerance of the goal.
	 * 
	 * @param aU angle unit
	 */
	public double getYawTolerance(AngleUnit aU) {
		return UnitConverter.convert(yawTolerance, iAU, aU);
	}


	/**
	 * Sets the tolerance of the Coordinates. Think of it as a circle with the
	 * given radius, which is "drawn" around the goal. If the center of the
	 * robot reaches the circle the goal is reached.
	 * 
	 * Normally used between 0.1 an 0.3.
	 * 
	 * @param coordinateTolerance
	 * 
	 * @param lU
	 * 		length unit of input
	 */
	public void setCoordinateTolerance(double coordinateTolerance,LengthUnit lU) {
		this.coordinateTolerance = UnitConverter.convert(coordinateTolerance, lU, iLU);
	}

	/**
	 * Set the yawTolerance, in many cases the oriantation of the robot is
	 * not important. The tolerance should then be set to 2*PI. Otherwise values
	 * around PI*0.1 will work quiet well.
	 * 
	 * @param yawTolerance
	 * 
	 * @param aU
	 * 		angle unit of input
	 */
	public void setYawTolerance(double yawTolerance, AngleUnit aU) {
		this.yawTolerance = UnitConverter.convert(yawTolerance, aU, iAU);
	}

	@Override
	public boolean equals(Object o) {
		if (this == o) return true;
		if (!(o instanceof NavigationGoalData)) return false;
		if (!super.equals(o)) return false;
		NavigationGoalData that = (NavigationGoalData) o;
		return Double.compare(that.coordinateTolerance, coordinateTolerance) == 0 &&
				Double.compare(that.yawTolerance, yawTolerance) == 0;
	}

	@Override
	public int hashCode() {

		return Objects.hash(super.hashCode(), coordinateTolerance, yawTolerance);
	}

	@Override
	public String toString() {
		return "NavigationGoalData[ x:" + getX(LengthUnit.METER) + " y:" + getY(LengthUnit.METER) + " yaw:" + getYaw(AngleUnit.RADIAN)
				+ " coordinateTolerance:" + coordinateTolerance + " yawTolerance:" + yawTolerance
				+ " frame:" + getFrameId() + " ]";
	}
}
