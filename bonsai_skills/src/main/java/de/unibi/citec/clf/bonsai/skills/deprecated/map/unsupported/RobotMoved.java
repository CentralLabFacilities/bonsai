package de.unibi.citec.clf.bonsai.skills.deprecated.map.unsupported;

import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

public class RobotMoved extends AbstractSkill {

    private static final String KEY_DISTANCE = "#_MIN_MOVE_DISTANCE";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";

    private PositionData lastRobotPosition = null;
    private PositionData currentRobotPosition = null;

    //defaults
    private double minGoalDistance = 0.1;
    private double timeout = 30000;

    // used tokens
    private ExitToken tokenSuccessNegativeResponse;

    private Sensor<PositionData> positionSensor;

    private long lastTime = 0;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccessNegativeResponse = configurator.requestExitToken(ExitStatus.SUCCESS().ps("notMoved"));
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        minGoalDistance = configurator.requestOptionalDouble(KEY_DISTANCE, minGoalDistance);
        timeout = configurator.requestOptionalDouble(KEY_TIMEOUT, timeout);

    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        if (lastRobotPosition == null) {
            try {
                logger.info("Use skill for the first time.");
                lastRobotPosition = positionSensor.readLast(1000);
                lastTime = Time.currentTimeMillis();
            } catch (IOException | InterruptedException ex) {
                Logger.getLogger(RobotMoved.class.getName()).log(Level.SEVERE, null, ex);

            }
            return ExitToken.loop(1000);

        }

        try {
            currentRobotPosition = positionSensor.readLast(1000);

        } catch (IOException | InterruptedException ex) {
            logger.fatal("can't read from positonSensor" + ex);
            return ExitToken.fatal();
        }
        if (currentRobotPosition == null) {
            logger.fatal("PositionSensor timed out");
            return ExitToken.loop();
        }

        if ((Time.currentTimeMillis() - lastTime) > 30000) {
            lastTime = Time.currentTimeMillis();
            logger.info("current check: " + Time.currentTimeMillis());
            double distance = currentRobotPosition.getDistance(lastRobotPosition, LengthUnit.METER);
            lastRobotPosition = currentRobotPosition;
            logger.info("Distance driven " + distance + "m" + "  minDistance:" + minGoalDistance);
            if (distance < minGoalDistance) {
                logger.info("robot not moved");
                return tokenSuccessNegativeResponse;
            }
        }
        return ExitToken.loop(1000);

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        logger.info("last check time:" + lastTime);
        return curToken;
    }
}
