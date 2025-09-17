package de.unibi.citec.clf.bonsai.strategies.exploration;



import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.data.vision1d.LaserData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import org.apache.log4j.Logger;

/**
 * This class implements an exploration strategy, that searches for the greatest
 * open space region in the laser range.
 * 
 * @author nkoester, sebschne, lziegler
 */
public class OpenSpaceExploration implements ExplorationStrategy,
        SensorListener<LaserData> {

    private static final int INITIAL_TIMEOUT = 100;

    private LaserData currentLaser;
    private Object laserLock = new Object();

    private Logger logger = Logger.getLogger(this.getClass());

    /**
     * Constructs a new instance of this strategy.
     * 
     * @param laserSensor
     *            A sensor receiving laser data.
     */
    public OpenSpaceExploration(Sensor<LaserData> laserSensor) {
        try {
            currentLaser = laserSensor.readLast(INITIAL_TIMEOUT);
        } catch (IOException e) {
            logger.warn("IO error while fetching initial slam map.");
            logger.debug(e);
        } catch (InterruptedException e) {
            logger.warn("Interrupted while fetching initial slam map.");
            logger.debug(e);
        }
        laserSensor.addSensorListener(this);
    }

    @Override
    public void newDataAvailable(LaserData newData) {
        synchronized (laserLock) {
            currentLaser = newData;
        }
    }

    @Override
    public NavigationGoalData getNextGoal(Pose2D currentPosition) {

        LaserData laserData = null;
        synchronized (laserLock) {
            laserData = currentLaser;
        }
        if (laserData == null) {
            NavigationGoalData goal = new NavigationGoalData(currentPosition);
            goal.setCoordinateTolerance(0.2, LengthUnit.METER);
            goal.setYawTolerance(2 * Math.PI, AngleUnit.RADIAN);
            return goal;
        }

        double[] newLaserDataValues = laserData.getScanValues(LengthUnit.METER);

        // use segments of 60 laser samples, resulting in 6 segments, each 30
        // degrees wide
        int n = 60;
        double bestLaserAngle = 0.0;
        double bestLaserDist = 0.0;

        for (int i = 0; i < newLaserDataValues.length - n; i += n) {
            double minDist = 8;
            for (int j = i; j < i + n - 1; j++) {
                minDist = Math.min(minDist, newLaserDataValues[j]);
            }
            // TODO This is some arbitrary value to decide, when to turn
            if (minDist > 0.7) {
                if (minDist > bestLaserDist) {
                    bestLaserAngle = LaserData.getAngleValue(i + n / 2,
                            AngleUnit.RADIAN);
                    bestLaserDist = minDist;
                }
            }

        }
        NavigationGoalData newNavigationGoalData = CoordinateSystemConverter
                .polar2NavigationGoalData(currentPosition, bestLaserAngle,
                        bestLaserDist * 0.4, AngleUnit.RADIAN, LengthUnit.METER);

        if (bestLaserDist < 0.3) {
            // if robot should turn, then the tolerance of the angle value must
            // be small
            newNavigationGoalData = CoordinateSystemConverter
                    .polar2NavigationGoalData(currentPosition, Math.PI, 0.0f,
                            AngleUnit.RADIAN, LengthUnit.METER);
            newNavigationGoalData.setYawTolerance(10, AngleUnit.DEGREE);
            logger.info("mainly turning");
        } else {
            // otherwise we don't care about orientation after motion
            newNavigationGoalData
                    .setYawTolerance(2 * Math.PI, AngleUnit.RADIAN);
        }

        logger.info("odometry=" + currentPosition);
        logger.info("bestLaserDist=" + bestLaserDist + " bestLaserAngle="
                + bestLaserAngle + " ("
                + (((bestLaserAngle - 180) / 2) * Math.PI / 180) + ")");

        logger.info("NavigationGoal is x="
                + newNavigationGoalData.getX(LengthUnit.METER) + " y="
                + newNavigationGoalData.getY(LengthUnit.METER) + " yaw="
                + newNavigationGoalData.getYaw(AngleUnit.RADIAN));

        return newNavigationGoalData;
    }

    @Override
    public NavigationGoalData getNextGoal(Pose2D currentPosition,
                                          Annotation region) {

        // TODO implement this!!
        return getNextGoal(currentPosition);
    }

}
