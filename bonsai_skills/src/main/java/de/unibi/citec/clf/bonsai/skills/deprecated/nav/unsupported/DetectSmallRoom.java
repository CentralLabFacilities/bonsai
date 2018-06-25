package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;

import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.vision1d.LaserData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * In this state the robot follows given person.
 *
 * @author jpoeppel /cklarhorst
 */
public class DetectSmallRoom extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessRoom;
    private ExitToken tokenSuccessNoroom;
    private ExitToken tokenError;

    /*
     * Sensors used by this state.
     */
    private Sensor<LaserData> laserSensor;
    /**
     * Threshold of mean laser scans to be used to determine if robot is in a small Room
     */
    private static final double DEFAULT_MEAN_THRESHOLD = 2.0;
    /**
     * Threshold of max laser distance to be used to determine if robot is in a small Room
     */
    private static final double DEFAULT_SCAN_THRESHOLD = 3.0;
    /**
     * Threshold of number laser scans greater the max distance to be used to determine if robot is in a small Room
     */
    private static final int DEFAULT_NUMBER_THRESHOLD = 200;
    /**
     * Default ID of the variable that contains the room threshold.
     */
    private static final String MEAN_THRESHOLD_ID = "#_MEAN_THRESHOLD";
    /**
     * Default ID of the variable that contains the allowed length for scans threshold.
     */
    private static final String SCAN_THRESHOLD_ID = "#_SCAN_THRESHOLD";
    /**
     * Default ID of the variable that contains the number of long scans threshold.
     */
    private static final String NUMBER_THRESHOLD_ID = "#_NUMBER_THRESHOLD";
    /**
     * Changeable config.
     */
    private double smallRoomMean_threshold;
    private double smallRoomScan_threshold;
    private int smallRoomNumber_threshold;

    private LaserData laserScans;
    private double laserSum;
    private double meanLaser;
    private int numToLong;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessRoom = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("room"));
        tokenSuccessNoroom = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noRoom"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        laserSensor = configurator.getSensor("LaserSensor", LaserData.class);
        smallRoomMean_threshold = configurator.requestOptionalDouble(MEAN_THRESHOLD_ID, DEFAULT_MEAN_THRESHOLD);
        smallRoomScan_threshold = configurator.requestOptionalDouble(SCAN_THRESHOLD_ID, DEFAULT_SCAN_THRESHOLD);
        smallRoomNumber_threshold = configurator.requestOptionalInt(NUMBER_THRESHOLD_ID, DEFAULT_NUMBER_THRESHOLD);

    }

    @Override
    public boolean init() {
        try {
            // check for person to follow from memory
            laserScans = laserSensor.readLast(100);
        } catch (IOException | InterruptedException ex) {
            Logger.getLogger(DetectSmallRoom.class.getName()).log(Level.SEVERE, null, ex);
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        if (laserScans == null) {
            logger.debug("Sry laser sensor return null so trying again");
            try {
                laserScans = laserSensor.readLast(100);
            } catch (IOException | InterruptedException e) {
                logger.debug("Exception while trying again to get laser data", e);
            }
        }

        if (laserScans != null) {
            double[] scans = laserScans.getScanValues(LengthUnit.METER);
            laserSum = 0.0;
            numToLong = 0;

            for (int i = 0; i < laserScans.getNumLaserPoints(); i++) {
                double scanValue = scans[i];
                laserSum += scanValue;
                if (scanValue > smallRoomScan_threshold) {
                    numToLong++;
                }
            }
            meanLaser = laserSum / laserScans.getNumLaserPoints();
            logger.info("Laser Sum is: " + laserSum);
            logger.info("Mean of Scans is: " + meanLaser + "threshold: " + smallRoomMean_threshold);
            logger.info("Number of too long scans: " + numToLong + "threshold: " + smallRoomNumber_threshold);
            if ((meanLaser < smallRoomMean_threshold) && (numToLong < smallRoomNumber_threshold)) {
                return tokenSuccessRoom;
            } else {
                return tokenSuccessNoroom;
            }
        } else {
            logger.error("LaserScans is again null! ERROR");
            return tokenError;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
}
