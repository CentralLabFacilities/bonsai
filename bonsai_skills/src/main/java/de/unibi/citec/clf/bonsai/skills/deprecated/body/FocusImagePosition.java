package de.unibi.citec.clf.bonsai.skills.deprecated.body;

import de.unibi.citec.clf.bonsai.actuators.GazeActuator;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.MapReader;

/**
 *
 * TODO: unmekafy. use setrobotgaze instead
 * 
 * @author lruegeme
 */
public class FocusImagePosition extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private static final String KEY_AZIMUTH = "#_AZIMUTH";
    private static final String KEY_ELEVATION = "#_ELEVATION";

    //default values
    private long timeout = 1000;
    private float azimuth = 0;
    private float elevation = 0;

    private GazeActuator gazeActuator;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        gazeActuator = configurator.getActuator("MekaSimpleGazeTool", GazeActuator.class);

        azimuth = (float) configurator.requestDouble(KEY_AZIMUTH);
        elevation = (float) configurator.requestDouble(KEY_ELEVATION);

    }

    @Override
    public boolean init() {
        timeout += Time.currentTimeMillis();
        gazeActuator.setGazeTarget(azimuth, elevation);
        return true;
    }

    @Override
    public ExitToken execute() {
        if (true) {
            if (timeout < Time.currentTimeMillis()) {
                return tokenSuccess;
            }
            return ExitToken.loop();
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
