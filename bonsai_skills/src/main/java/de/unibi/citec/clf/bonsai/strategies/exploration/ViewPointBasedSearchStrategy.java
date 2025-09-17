package de.unibi.citec.clf.bonsai.strategies.exploration;



import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
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
    ArrayList<Pose2D> allViewPoints = new ArrayList<>();
    ArrayList<Pose2D> remainingViewPoints = new ArrayList<>();
    ArrayList<Pose2D> missmatch = new ArrayList<>();

    void addViewPoint(Pose2D point) {
        logger.debug("addPoint " + point);
        System.out.println("addPoint " + point);
        allViewPoints.add(point);
        remainingViewPoints.add(point);
    }

    void addMissMatchPoint(Pose2D point) {
        missmatch.add(point);
    }

    void removeViewPoint(Pose2D point) {
        allViewPoints.remove(point);
        remainingViewPoints.remove(point);
    }

    public boolean hasViewPoints() {
        return (allViewPoints.size() > 0) && (remainingViewPoints.size() > 0);
    }

    @Override
    public NavigationGoalData getNextGoal(Pose2D currentPosition) {
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
        Pose2D minDistPos = null;
        for (Pose2D p : remainingViewPoints) {
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
            goal.setFrameId(Pose2D.ReferenceFrame.LOCAL);
        }
        return goal;
    }

    @Override
    public NavigationGoalData getNextGoal(Pose2D currentPosition,
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
        Pose2D minDistPos = null;
        for (Pose2D p : remainingViewPoints) {
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
