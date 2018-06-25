package de.unibi.citec.clf.bonsai.skills.dialog;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.io.IOException;
import java.util.concurrent.Future;
import java.util.regex.Matcher;

/**
 * This class is used to say something with some or all content read in from the
 * memory.
 *
 * <pre>
 *
 * Options:
 *  #_MESSAGE:      [String] Optional (default: "$S")
 *                      -> Text said by the robot. $S will be replaced by memory slot content
 *  #_BLOCKING:     [boolean] Optional (default: true)
 *                      -> If true skill ends after talk was completed
 *
 * Slots:
 *  StringSlot: [String] [Read]
 *      -> String to incorporate into talk
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
 *
 * @author rfeldhans
 * @author jkummert
 *
 */
public class SaySlot extends AbstractSkill {

    private static final String SAY_TEXT = "#_MESSAGE";
    private static final String KEY_BLOCKING = "#_BLOCKING";
    private static final String REPLACE_STRING = "$S";

    private boolean blocking = true;
    private String sayText = REPLACE_STRING;

    private ExitToken tokenSuccess;

    private MemorySlotReader<String> stringSlot;

    private SpeechActuator speechActuator;

    private Future<Void> sayingComplete;

    @Override
    public void configure(ISkillConfigurator configurator) {
        sayText = configurator.requestOptionalValue(SAY_TEXT, sayText);
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
        stringSlot = configurator.getReadSlot("StringSlot", String.class);
    }

    @Override
    public boolean init() {

        String sayStr = null;
        try {
            sayStr = stringSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read from String slot", ex);
            return false;
        }

        if (sayStr == null) {
            logger.error("String from slot is null");
            return false;
        }

        sayStr = sayText.replaceAll(Matcher.quoteReplacement(REPLACE_STRING), sayStr);
        sayStr = sayStr.replaceAll("_", " ");

        try {
            sayingComplete = speechActuator.sayAsync(sayStr);
        } catch (IOException e) {
            logger.error("Could not call speech actuator");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (!sayingComplete.isDone() && blocking) {
            return ExitToken.loop();
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
