package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;


import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.vision1d.LaserData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import de.unibi.citec.clf.btl.units.SpeedUnit;
import java.io.IOException;

/**
 * Drive robot onto charging station.
 * TODO: use current navactuator calls
 *
 * @author pdressel
 */
public class DriveOntoChargingStation extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccess;

    private enum DriveState {

        TURNING_INIT,
        DRIVING_INIT,
        TURNING_END,
        DRIVING_END
    }
    private static final int NUM_USED_POINTS = 80;
    private static final int NUM_COMPARE_POINTS = 6;
    private static final int CONNECTED_LASERDATA_THRESHOLD_CM = 2;
    private static final int DISTANCE_FROM_BASE_CM = 10;
    private static final int DEFAULT_CLOSEST_INDEX = 180;
    private static final double MIN_ANGLE_TOLERANCE = 2;
    private static final double INIT_ANGLE_TOLERANCE = 15;
    private Sensor<LaserData> laserDataSensor;
    private Sensor<PositionData> robotPositionSensor;
    private NavigationActuator navigationActuator;
    private double distanceCM;
    private double angleD;
    private double adjacentDistance;
    private double oppositeDistance;
    private double turnBackAngle;
    private DriveState state;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        laserDataSensor = configurator.getSensor(
                "LaserSensor", LaserData.class);
        robotPositionSensor = configurator.getSensor(
                "PositionSensor", PositionData.class);
        navigationActuator = configurator.getActuator(
                "NavigationActuator", NavigationActuator.class);
    }

    @Override
    public boolean init() {
        LaserData laserData = null;
        PositionData robotPosition = null;
        try {
            laserData = laserDataSensor.readLast(3000);
            robotPosition = robotPositionSensor.readLast(3000);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not retrieve sensor data!", ex);
            return false;
        }

        if (laserData == null) {
            logger.error("No laser data!");
            return false;
        }
        if (robotPosition == null) {
            logger.error("No robot position!");
            return false;
        }

        double[] laserScans = laserData.getScanValues(LengthUnit.CENTIMETER);
        int closestIndex = this.getBestLaserScanIndex(laserScans);

        distanceCM = laserScans[closestIndex];
        angleD = 90 - (closestIndex / 2);

        double initialAngle = -90; //- robotPosition.getYaw(AngleUnit.DEGREE);
        turnBackAngle = 90;
        if (angleD > 0) {
            initialAngle *= -1;
            turnBackAngle *= -1;
        }

        double calcAngle = 90 - angleD;

        adjacentDistance = Math.abs(Math.cos(Math.toRadians(calcAngle)) * distanceCM);
        oppositeDistance = Math.abs(Math.sin(Math.toRadians(calcAngle)) * distanceCM) - DISTANCE_FROM_BASE_CM;

        logger.debug("distanceCm=" + distanceCM + "\n"
                + "angleD=" + angleD + "\n"
                + "initialAngle=" + initialAngle + "\n"
                + "turnBackAngle=" + turnBackAngle + "\n"
                + "adjacentDistance=" + adjacentDistance + "\n"
                + "oppositeDistance=" + oppositeDistance + "\n");

        logger.error("The index of the best point is " + closestIndex
                + " and the distance is " + distanceCM + " cm"
                + " with angle " + angleD + "\n");

        if (Math.abs(angleD) > INIT_ANGLE_TOLERANCE) {
            try {
                navigationActuator.turn(initialAngle, AngleUnit.DEGREE, 0.3, RotationalSpeedUnit.DEGREES_PER_SEC);
                state = DriveState.TURNING_INIT;
                logger.debug("Starting state " + state);
            } catch (IOException ex) {
                logger.warn("Could not turn!", ex);
                return false;
            }
        } else if (Math.abs(angleD) > MIN_ANGLE_TOLERANCE) {
            try {
                navigationActuator.turn(angleD, AngleUnit.DEGREE, 0.3, RotationalSpeedUnit.DEGREES_PER_SEC);
                state = DriveState.TURNING_END;
                logger.debug("Starting state " + state);
            } catch (IOException ex) {
                logger.warn("Could not turn!", ex);
                return false;
            }
        } else {
            try {
                navigationActuator.drive(distanceCM, LengthUnit.CENTIMETER, 0.05, SpeedUnit.METER_PER_SEC);
                state = DriveState.DRIVING_END;
                logger.debug("Starting state " + state);
            } catch (IOException ex) {
                logger.warn("Could not turn!", ex);
                return false;
            }
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        /*
        try {
            if (navigationActuator.driveTurnDone().isStopped()) {
                switch (state) {
                    case TURNING_INIT:
                        try {
                            navigationActuator.drive(adjacentDistance, LengthUnit.CENTIMETER, 0.05, SpeedUnit.METER_PER_SEC);
                            state = DriveState.DRIVING_INIT;
                            logger.debug("Starting state " + state);
                        } catch (IOException ex) {
                            logger.warn("Could not drive!", ex);
                            return tokenError;
                        }
                        break;
                    case DRIVING_INIT:
                        try {
                            navigationActuator.turn(turnBackAngle, AngleUnit.DEGREE, 0.3, RotationalSpeedUnit.DEGREES_PER_SEC);
                            state = DriveState.TURNING_END;
                            logger.debug("Starting state " + state);
                        } catch (IOException ex) {
                            logger.warn("Could not turn!", ex);
                            return tokenError;
                        }
                        break;
                    case TURNING_END:
                        try {
                            navigationActuator.drive(oppositeDistance, LengthUnit.CENTIMETER, 0.05, SpeedUnit.METER_PER_SEC);
                            state = DriveState.DRIVING_END;
                            logger.debug("Starting state " + state);
                        } catch (IOException ex) {
                            logger.warn("Could not turn!", ex);
                            return tokenError;
                        }
                        break;
                    case DRIVING_END:
                        logger.debug("Finished :)");
                        return tokenSuccess;
                }
            }
        } catch (IOException e) {
            logger.warn(e.getMessage());
            return tokenError;
        }*/

        return ExitToken.loop();
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        return tokenSuccess;
    }

    public int getBestLaserScanIndex(double[] laserScans) {

        int closestIndex = DEFAULT_CLOSEST_INDEX;

        for (int i = ((laserScans.length / 2) - (NUM_USED_POINTS / 2));
                i < ((laserScans.length / 2) + (NUM_USED_POINTS / 2));
                ++i) {

            if (i >= 0) {

                double closestLaserScan = laserScans[closestIndex];
                double currentLaserScan = laserScans[i];

                if (currentLaserScan > closestLaserScan) {
                    continue;
                }

                boolean scanValid = true;

                for (int j = (i - NUM_COMPARE_POINTS); j <= (i + NUM_COMPARE_POINTS); ++j) {
                    if (j >= 0) {
                        double localClosestLaserScan = laserScans[i];
                        double localCurrentLaserScan = laserScans[j];

                        if (Math.abs(localClosestLaserScan - localCurrentLaserScan)
                                > CONNECTED_LASERDATA_THRESHOLD_CM) {
                            scanValid = false;
                        }
                    }
                }

                if (scanValid) {
                    closestIndex = i;
                }
            }
        }

        return closestIndex;
    }
}
