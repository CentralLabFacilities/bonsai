package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.vision1d.SonarData;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;

/**
 * Loops until timeout is over (loops infinite if timeout is -1 [default])
 * or something is in the specified range of the sonar sensor (default = 2.0) IN METER
 *
 * You can also set front or back sensor (default = front)
 *
 * <pre>
 *
 * Options:
 *  #_RANGE: [double] Optional (default: 2.0)
 *                  -> The range to look for detections in m
 *  #_KEY_DIRECTION: [String] Optional (default: "front")
 *                  -> The direction to check the range
 *  #_TIMEOUT           [long] Optional (default: -1)
 *                          -> Amount of time robot searches for something in range
 *
 * Slots:
 *
 * ExitTokens:
 *  success.inRange:    Detections are in range
 *  success.timeout:    Time has run out
 *
 *
 * Sensors:
 *  SonarSensor: [SonarData]
 *      -> Get sonar sensor data
 *
 * Actuators:
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class WaitForPersonInRangeSonar extends AbstractSkill {

    private static final String KEY_RANGE = "#_RANGE";
    private static final String KEY_DIRECTION = "#_DIRECTION";
    private final static String KEY_TIMEOUT = "#_TIMEOUT";

    private double range = 2.0;
    private String direction = "front";
    private long timeout = -1l;

    private ExitToken tokenSuccessInRange;
    private ExitToken tokenSuccessTimeout;
    private ExitToken tokenError;

    private Sensor<SonarData> sonarSensor;

    private SonarData sonarData;

    @Override
    public void configure(ISkillConfigurator configurator) {
        range = configurator.requestOptionalDouble(KEY_RANGE, range);
        direction = configurator.requestOptionalValue(KEY_DIRECTION, direction);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);

        tokenSuccessInRange = configurator.requestExitToken(ExitStatus.SUCCESS().ps("inRange"));
        tokenSuccessTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        if(direction.toLowerCase().equals("front")){
            sonarSensor = configurator.getSensor("FrontSonarSensor", SonarData.class);
        } else {
            sonarSensor = configurator.getSensor("BackSonarSensor", SonarData.class);
        }
    }

    @Override
    public boolean init() {
        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + " ms");
            timeout += System.currentTimeMillis();
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeout > 0) {
            if (System.currentTimeMillis() > timeout) {
                logger.debug("Search for person reached timeout");
                return tokenSuccessTimeout;
            }
        }

        try {
            sonarData = sonarSensor.readLast(600);
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read from sonar sensor");
            return tokenError;
        }

        if (sonarData == null) {
            logger.warn("sonarData was null - Looping");
            return ExitToken.loop(50);
        }

        if (sonarData.getDistanceLeft(LengthUnit.METER) <= range) {
            logger.debug("CHECK RANGE: " + sonarData.getDistanceLeft(LengthUnit.METER) + " <= " + range);
            return tokenSuccessInRange;
        } else {
            logger.trace("CHECK RANGE: " + sonarData.getDistanceLeft(LengthUnit.METER) + " > " + range);
            return ExitToken.loop(50);
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
