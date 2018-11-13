package de.unibi.citec.clf.bonsai.skills.dialog;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.SimpleSpeechHelper;
import de.unibi.citec.clf.btl.data.speechrec.Utterance;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Wait for confirmation by a speech command.
 *
 * <pre>
 *
 * Options:
 *  #_MESSAGE:             [String] Optional (default: "Was that correct?")
 *                          -> Text said by the robot before waiting for confirmation
 *  #_USESIMPLE:        [boolean] Optional (default: true)
 *                          -> If true robot only listens for confirmation, no talks
 *  #_TIMEOUT           [long] Optional (default: -1)
 *                          -> Amount of time robot waits for confirmation in ms
 *  #_REPEAT_AFTER:     [long] Optional (default: 5000)
 *                          -> Time between the robot asking #_TEXT again in ms
 *  #_REPEATS:          [int] Optional (default: 1)
 *                          -> Amount of times #_TEXT is asked
 *  #_NONTERMINAL_NO:   [String] Optional (default: "confirm_no")
 *                          -> Name of nonterminal in grammar that signals no
 *  #_NONTERMINAL_YES:  [String] Optional (default: "confirm_yes")
 *                          -> Name of nonterminal in grammar that signals yes
 *  #_SPEECH_SENSOR:    [String] Optional (default: "SpeechSensorConfirm")
 *                          -> Which speech sensor to use for new understandings
 *
 * Slots:
 *
 * ExitTokens:
 *  success.confirmYes: Recieved confirmation
 *  success.confirmNo:  Received denial
 *  success.timeout:    Timeout reached (only used when #_TIMEOUT is set to positive value)
 *
 * Sensors:
 *  #_SPEECH_SENSOR: [Utterance]
 *      -> Used to listen for confirmation
 *
 * Actuators:
 *  SpeechActuator: [SpeechActuator]
 *      -> Used to ask #_TEXT for confirmation
 *
 * </pre>
 *
 * @author hterhors, prenner, lkettenb, ssharma, lruegeme
 * @author rfeldhans
 * @author jkummert
 */
public class ConfirmYesOrNo extends AbstractSkill {

    private static final String KEY_TEXT = "#_MESSAGE";
    private static final String KEY_SIMPLE = "#_USESIMPLE";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_REPEAT = "#_REPEAT_AFTER";
    private static final String KEY_MAXREP = "#_REPEATS";
    private static final String KEY_NONTERMINAL_NO = "#_NONTERMINAL_NO";
    private static final String KEY_NONTERMINAL_YES = "#_NONTERMINAL_YES";
    private static final String KEY_SPEECH_SENSOR = "#_SPEECH_SENSOR";

    private String confirmText = "Was that correct?";
    private boolean simpleYesOrNo = true;
    private long timeout = -1;
    private long timeUntilRepeat = 5000;
    private int maxRepeats = 1;
    private String nonTerminalNo = "confirm_no";
    private String nonTerminalYes = "confirm_yes";
    private String speechSensorName = "SpeechSensorConfirm";

    private ExitToken tokenSuccessPsTimeout;
    private ExitToken tokenSuccessPsYes;
    private ExitToken tokenSuccessPsNo;

    private static final String ACTUATOR_SPEECHACTUATOR = "SpeechActuator";

    private static final String PS_TIMEOUT = "timeout";
    private static final String PS_NO = "confirmNo";
    private static final String PS_YES = "confirmYes";

    private Sensor<Utterance> speechSensor;
    private SimpleSpeechHelper speechManager;
    private SpeechActuator speechActuator;

    private long nextRepeat = 0;
    private int timesAsked = 0;

    private Future<Void> sayingComplete = null;

    @Override
    public void configure(ISkillConfigurator configurator) {

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        simpleYesOrNo = configurator.requestOptionalBool(KEY_SIMPLE, simpleYesOrNo);
        timeUntilRepeat = configurator.requestOptionalInt(KEY_REPEAT, (int) timeUntilRepeat);
        maxRepeats = configurator.requestOptionalInt(KEY_MAXREP, maxRepeats);
        confirmText = configurator.requestOptionalValue(KEY_TEXT, confirmText);
        nonTerminalNo = configurator.requestOptionalValue(KEY_NONTERMINAL_NO, nonTerminalNo);
        nonTerminalYes = configurator.requestOptionalValue(KEY_NONTERMINAL_YES, nonTerminalYes);
        speechSensorName = configurator.requestOptionalValue(KEY_SPEECH_SENSOR, speechSensorName);

        tokenSuccessPsYes = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_YES));
        tokenSuccessPsNo = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_NO));
        if (timeout > 0) {
            tokenSuccessPsTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps(PS_TIMEOUT));
        }

        speechSensor = configurator.getSensor(speechSensorName, Utterance.class);
        speechActuator = configurator.getActuator(ACTUATOR_SPEECHACTUATOR, SpeechActuator.class);
    }

    @Override
    public boolean init() {
        speechManager = new SimpleSpeechHelper(speechSensor, true);
        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + " ms");
            timeout += System.currentTimeMillis();
        }

        speechManager.startListening();
        return true;
    }

    @Override
    public ExitToken execute() {

        if (timeout > 0) {
            if (System.currentTimeMillis() > timeout) {
                logger.info("ConfirmYesOrNo timeout");
                return tokenSuccessPsTimeout;
            }
        }

        if (simpleYesOrNo) {
            // call simple yes or no confirmation
            return simpleYesNo();
        } else {
            // call confirm yes or no with limited number of retries and
            // conformations from robot
            return confirmYesNo();
        }

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        speechManager.removeHelper();
        return curToken;
    }

    private ExitToken simpleYesNo() {

        if (!speechManager.hasNewUnderstanding()) {
            return ExitToken.loop(50);
        }

        if (!speechManager.getUnderstoodWords(nonTerminalYes).isEmpty()) {
            return tokenSuccessPsYes;
        } else if (!speechManager.getUnderstoodWords(nonTerminalNo).isEmpty()) {
            return tokenSuccessPsNo;
        }

        return ExitToken.loop(50);

    }

    private ExitToken confirmYesNo() {

        if (sayingComplete != null) {
            if (!sayingComplete.isDone()) {
                speechManager.startListening();
                return ExitToken.loop(50);
            }
        }

        // Ask Again
        if (System.currentTimeMillis() > nextRepeat) {
            if (timesAsked++ < maxRepeats) {
                try {
                    sayingComplete = speechActuator.sayAsync(confirmText);
                } catch (IOException ex) {
                    logger.error("IO Exception in speechActuator");
                }
                nextRepeat = System.currentTimeMillis() + timeUntilRepeat;
                return ExitToken.loop(50);
            }
        }

        // Loop if no new Understandings
        if (!speechManager.hasNewUnderstanding()) {
            return ExitToken.loop(50);
        }

        if (!speechManager.getUnderstoodWords(nonTerminalYes).isEmpty()) {
            return tokenSuccessPsYes;
        } else if (!speechManager.getUnderstoodWords(nonTerminalNo).isEmpty()) {
            return tokenSuccessPsNo;
        }

        try {
            sayingComplete = speechActuator.sayAsync("Sorry, please repeat!");
        } catch (IOException ex) {
            logger.error("IO Exception in speechActuator");
        }
        return ExitToken.loop(50);

    }
}
