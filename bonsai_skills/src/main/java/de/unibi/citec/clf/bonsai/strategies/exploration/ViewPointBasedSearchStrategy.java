package de.unibi.citec.clf.bonsai.strategies.exploration;



import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.util.ArrayList;
import org.apache.log4j.Logger;
/**
 * 
 * @author unknown
 * @deprecated This strategy uses obsolete annotations.
 */
@Deprecated
public class ViewPointBasedSearchStrategy implements ExplorationStrategy {

    private Logger logger = Logger.getLogger(this.getClass());
    static final double COORDINATE_TOLERANCE = 0.5; // meters
    ArrayList<PositionData> allViewPoints = new ArrayList<>();
    ArrayList<PositionData> remainingViewPoints = new ArrayList<>();
    ArrayList<PositionData> missmatch = new ArrayList<>();

    void addViewPoint(PositionData point) {
        logger.debug("addPoint " + point);
        System.out.println("addPoint " + point);
        allViewPoints.add(point);
        remainingViewPoints.add(point);
    }

    void addMissMatchPoint(PositionData point) {
        missmatch.add(point);
    }

    void removeViewPoint(PositionData point) {
        allViewPoints.remove(point);
        remainingViewPoints.remove(point);
    }

    public boolean hasViewPoints() {
        return (allViewPoints.size() > 0) && (remainingViewPoints.size() > 0);
    }

    @Override
    public NavigationGoalData getNextGoal(PositionData currentPosition) {
        logger.info("getNextGoal");

        if (remainingViewPoints.isEmpty()) {
            if (missmatch.isEmpty()) {
                remainingViewPoints.addAll(allViewPoints);
            } else {
                remainingViewPoints.addAll(missmatch);
            }
        }

        logger.debug(remainingViewPoints);
        System.out.println(remainingViewPoints);

        logger.debug("currentPosition " + currentPosition);

        double minDist = Double.MAX_VALUE;
        PositionData minDistPos = null;
        for (PositionData p : remainingViewPoints) {
            logger.debug("PositionData " + p);
            double d = Math.sqrt(Math.pow(
                    p.getX(LengthUnit.METER)
                    - currentPosition.getX(LengthUnit.METER), 2)
                    + Math.pow(p.getY(LengthUnit.METER)
                    - currentPosition.getY(LengthUnit.METER), 2));
            logger.debug("minDist " + minDist + " d " + d);
            if (d < minDist) {
                minDist = d;
                minDistPos = p;
            }
        }
        remainingViewPoints.remove(minDistPos);
        logger.debug("goarl " + minDistPos);

        NavigationGoalData goal = null;
        if (minDistPos != null) {
            goal = new NavigationGoalData(minDistPos);
            goal.setCoordinateTolerance(COORDINATE_TOLERANCE, LengthUnit.METER);
            goal.setFrameId(PositionData.ReferenceFrame.LOCAL);
        }
        return goal;
    }

    @Override
    public NavigationGoalData getNextGoal(PositionData currentPosition,
            Annotation roomPosition) {
        logger.info("getNextGoal");

        if (remainingViewPoints.isEmpty()) {
            if (missmatch.isEmpty()) {
                remainingViewPoints.addAll(allViewPoints);
            } else {
                remainingViewPoints.addAll(missmatch);
            }
        }

        logger.debug(remainingViewPoints);

        logger.debug("currentPosition " + currentPosition);

        double minDist = Double.MAX_VALUE;
        PositionData minDistPos = null;
        for (PositionData p : remainingViewPoints) {
            logger.debug("PositionData " + p);
            logger.debug("roomPosition " + roomPosition);
            double d = Math.sqrt(Math.pow(
                    p.getX(LengthUnit.METER)
                    - currentPosition.getX(LengthUnit.METER), 2)
                    + Math.pow(p.getY(LengthUnit.METER)
                    - currentPosition.getY(LengthUnit.METER), 2));
            logger.debug("minDist " + minDist + " d " + d);
            if (d < minDist
                    && roomPosition.getPolygon().contains(p.getX(LengthUnit.METER),
                    p.getY(LengthUnit.METER),LengthUnit.METER)) {
                minDist = d;
                minDistPos = p;
            }
        }
        remainingViewPoints.remove(minDistPos);
        logger.debug("goarl " + minDistPos);
        if (minDistPos == null) {
            minDistPos = roomPosition.getViewpoints().getFirst();
        }
        NavigationGoalData goal = new NavigationGoalData(minDistPos);
        goal.setCoordinateTolerance(COORDINATE_TOLERANCE, LengthUnit.METER);
        return goal;
    }
}
