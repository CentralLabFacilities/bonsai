package de.unibi.citec.clf.btl.data.navigation;

import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.units.LengthUnit;

import org.apache.log4j.Logger;

/**
 * Data class for plans from the global path planner component.
 * 
 * @author jwienke
 */
public class GlobalPlan extends List<NavigationGoalData>  {

	private static Logger logger = Logger.getLogger(GlobalPlan.class);

	public GlobalPlan() {super(NavigationGoalData.class);}


	/**
	 * Adds a new waypoint to the plan.
	 * 
	 * @deprecated use {@link #add(NavigationGoalData)} instead.
	 * @param wp
	 *            waypoint to add
	 */
	@Deprecated
	public void addWaypoint(final NavigationGoalData wp) {
		elements.add(wp);
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		StringBuilder stringBuilder = new StringBuilder();

		stringBuilder.append("Waypoints:\n");
		for (Pose2D wp : this) {
			stringBuilder.append("(" + wp.getX(LengthUnit.METER) + ", " + wp.getY(LengthUnit.METER) + ")\n");
		}

		return stringBuilder.toString();
	}

}
