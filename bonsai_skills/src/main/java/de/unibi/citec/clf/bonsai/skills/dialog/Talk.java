package de.unibi.citec.clf.bonsai.skills.dialog;


import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Use this state to let the robot talk.
 *
 * <pre>
 *
 * Options:
 *  #_MESSAGE:      [String] Required
 *                      -> Text said by the robot
 *  #_BLOCKING:     [boolean] Optional (default: true)
 *                      -> If true skill ends after talk was completed
 *
 * Slots:
 *
 * ExitTokens:
 *  success:    Talk completed successfully
 *
 * Sensors:
 *
 * Actuators:
 *  SpeechActuator: [SpeechActuator]
 *      -> Used to say #_MESSAGE
 *
 * </pre>
 *
 * @author lziegler, lruegeme
 * @author rfeldhans
 * @author jkummert
 */
public class Talk extends AbstractSkill {

    private static final String KEY_MESSAGE = "#_MESSAGE";
    private static final String KEY_BLOCKING = "#_BLOCKING";

    private ExitToken tokenSuccess;

    private boolean blocking = true;
    private String text = "";

    private SpeechActuator speechActuator;
    private Future<Void> sayingComplete;

    @Override
    public void configure(ISkillConfigurator configurator) {

        text = configurator.requestValue(KEY_MESSAGE);
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
    }

    @Override
    public boolean init() {
        try {
            sayingComplete = speechActuator.sayAsync(text);
        } catch (IOException ex) {
            logger.error("Could not call speech actuator");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (!sayingComplete.isDone() && blocking){
            return ExitToken.loop(50);
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
