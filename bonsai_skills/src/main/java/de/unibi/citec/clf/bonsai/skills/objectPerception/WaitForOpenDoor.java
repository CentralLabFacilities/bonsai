package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.hardwareinfo.LaserInfo.OutOfRangeException;
import de.unibi.citec.clf.btl.data.vision1d.LaserData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import static de.unibi.citec.clf.btl.units.LengthUnit.METER;

/**
 * Use this state to wait until the door opens.
 *
 * @author nkoester
 * @author lkettenb
 */
public class WaitForOpenDoor extends AbstractSkill implements
        SensorListener<LaserData> {

    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_DIFF = "#_DIFF";

    //defaults
    private long timeout = -1;
    private double distDiff = 1.5;

    public static final int TIME_TO_SLEEP = 500;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessTimeout;

    private Sensor<LaserData> laserSensor;

    private double initAvgDist = -1.0;
    private boolean isOpen = false;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        laserSensor = configurator.getSensor("LaserSensor", LaserData.class);

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        distDiff = configurator.requestOptionalDouble(KEY_DIFF, distDiff);

        if (timeout > 0) {
            tokenSuccessTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        }

    }

    @Override
    public boolean init() {
        laserSensor.addSensorListener(this);
        initAvgDist = 0;

        if (timeout > 0) {
            logger.info("using timeout of " + timeout + "ms");
            timeout += System.currentTimeMillis();
        }
        logger.info("using diff threshold of " + distDiff);

        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeout > 0) {
            if (System.currentTimeMillis() > timeout) {
                logger.info("ConfirmYesOrNo timeout");
                return tokenSuccessTimeout;
            }
        }

        if (!isOpen) {
            return ExitToken.loop(50);
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        laserSensor.removeSensorListener(this);
        return tokenSuccess;
    }

    @Override
    public void newDataAvailable(LaserData newData) {
        logger.debug("WFOD: enter");
        if (initAvgDist <= 0) {
            try {
                initAvgDist = newData.getAverageScanValue(0, 5, AngleUnit.DEGREE, METER);
                logger.debug("WFOD: initavgdist=" + initAvgDist);
            } catch (OutOfRangeException ex) {
                logger.debug("WFOD: initavgdist failed");
                return;
            }
        } else if (initAvgDist > distDiff) {
            this.isOpen = true;
            return;
        }

        double scanWidth = 5;
        double avgDist = initAvgDist;
        try {
            avgDist = newData.getAverageScanValue(0, scanWidth,
                    AngleUnit.DEGREE, LengthUnit.METER);
        } catch (OutOfRangeException ex) {
            logger.debug("WFOD: oorange");
        }
        logger.debug("WFOD: initAvgDist=" + initAvgDist);
        logger.debug("WFOD: avgDist=" + avgDist);

        double diff = avgDist - this.initAvgDist;
        logger.debug("WFOD: diff=" + diff);
        if (diff > distDiff) {
            logger.debug("WFOD: door OPEN, diff = " + diff);
            this.isOpen = true;
        }
    }

}
