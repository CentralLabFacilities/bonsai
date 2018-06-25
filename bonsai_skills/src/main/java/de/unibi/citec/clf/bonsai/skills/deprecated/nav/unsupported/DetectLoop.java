package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;

import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 * Detects if robot returned to his start position
 *
 * Exits with success
 *
 * @author lruegeme
 */
public class DetectLoop extends AbstractSkill {

    private static final String KEY_STARTDIST = "#_STARTDIST";
    private static final String KEY_REACHDIST = "#_DETECTDIST";

    // used tokens
    private ExitToken tokenSuccess;
    private Sensor<PositionData> positionSensor;

    private PositionData startPos;
    private boolean started = false;
    private double startDist;
    private double reachDist;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        startDist = configurator.requestDouble(KEY_STARTDIST);
        reachDist = configurator.requestDouble(KEY_REACHDIST);

    }

    @Override
    public boolean init() {
        try {
            startPos = positionSensor.readLast(1000);
        } catch (IOException | InterruptedException e) {
            logger.error(e.getMessage());
            return false;
        }
        if (startPos == null) {
            logger.fatal("Sry positionSensor timed out --> looping");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        PositionData curPos;
        try {
            curPos = positionSensor.readLast(1000);
            if (curPos == null) {
                logger.fatal("Sry positionSensor timed out --> looping");
                return ExitToken.loop();
            }
        } catch (IOException | InterruptedException e) {
            logger.error(e.getMessage());
            return ExitToken.loop();
        }

        double dist = curPos.getDistance(startPos, LengthUnit.METER);
        logger.debug("currentDistance: " + dist + " started:" + started);
        if (!started) { //wait until dist > startDist
            if (dist > startDist) {
                started = true;
            }
            return ExitToken.loop(2000);
        } else { //wait until dist < detectDist
            if (dist > reachDist) {
                return tokenSuccess;
            }
            return ExitToken.loop(2000);
        }

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
