package de.unibi.citec.clf.bonsai.skills.dialog.nlu;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.SimpleNLUHelper;
import de.unibi.citec.clf.bonsai.util.helper.SimpleSpeechHelper;
import de.unibi.citec.clf.btl.data.speechrec.NLU;
import de.unibi.citec.clf.btl.data.speechrec.Utterance;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.Future;

/**
 * Wait for confirmation by a speech command using NLU.
 *
 * <pre>
 *
 * Options:
 *  #_MESSAGE:             [String] Optional (default: "Was that correct?")
 *                          -> Text said by the robot before waiting for confirmation
 *  #_USESIMPLE:        [boolean] Optional (default: true)
 *                          -> If true: the robot only listens for confirmation (no talks)
 *  #_TIMEOUT           [long] Optional (default: -1)
 *                          -> Amount of time robot waits for confirmation in ms
 *  #_REPEAT_AFTER:     [long] Optional (default: 5000)
 *                          -> Time between the robot asking #_TEXT again in ms
 *  #_REPEATS:          [int] Optional (default: 1)
 *                          -> Amount of times #_TEXT is asked
 *  #_INTENT_NO:   [String] Optional (default: "confirm_no")
 *                          -> Name of intent that signals no
 *  #_INTENT_YES:  [String] Optional (default: "confirm_yes")
 *                          -> Name of intent that signals yes
 *  #_SPEECH_SENSOR:    [String] Optional (default: "NLUSensor")
 *                          -> Which sensor to use for new understandings
 *
 * Slots:
 *
 * ExitTokens:
 *  success.confirmYes: Received confirmation
 *  success.confirmNo:  Received denial
 *  success.timeout:    Timeout reached (only used when #_TIMEOUT is set to positive value)
 *
 * Sensors:
 *  #_SPEECH_SENSOR: [NLU]
 *      -> Used to listen for confirmation
 *
 * Actuators:
 *  SpeechActuator: [SpeechActuator]
 *      -> Used to ask #_TEXT for confirmation
 *
 * </pre>
 *
 * @author hterhors, prenner, lkettenb, ssharma, lruegeme, nschmitz
 * @author rfeldhans
 * @author jkummert
 */
public class ConfirmYesOrNo extends AbstractSkill  {

    private static final String KEY_TEXT = "#_MESSAGE";
    private static final String KEY_SIMPLE = "#_USESIMPLE";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_REPEAT = "#_REPEAT_AFTER";
    private static final String KEY_MAXREP = "#_REPEATS";
    private static final String KEY_INTENT_NO = "#_INTENT_NO";
    private static final String KEY_INTENT_YES = "#_INTENT_YES";
    private static final String KEY_SPEECH_SENSOR = "#_SPEECH_SENSOR";

    private String confirmText = "Was that correct?";
    private boolean simpleYesOrNo = true;
    private long timeout = -1;
    private long timeUntilRepeat = 5000;
    private int maxRepeats = 1;
    private String intentNo = "confirm_no";
    private String intentYes = "confirm_yes";
    private String speechSensorName = "NLUSensor";

    private ExitToken tokenSuccessPsTimeout;
    private ExitToken tokenSuccessPsYes;
    private ExitToken tokenSuccessPsNo;

    private static final String ACTUATOR_SPEECHACTUATOR = "SpeechActuator";

    private static final String PS_TIMEOUT = "timeout";
    private static final String PS_NO = "confirmNo";
    private static final String PS_YES = "confirmYes";

    private SimpleNLUHelper helper;
    private Sensor<NLU> speechSensor;
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
        intentNo = configurator.requestOptionalValue(KEY_INTENT_NO, intentNo);
        intentYes = configurator.requestOptionalValue(KEY_INTENT_YES, intentYes);
        speechSensorName = configurator.requestOptionalValue(KEY_SPEECH_SENSOR, speechSensorName);

        tokenSuccessPsYes = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_YES));
        tokenSuccessPsNo = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_NO));
        if (timeout > 0) {
            tokenSuccessPsTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps(PS_TIMEOUT));
        }

        speechSensor = configurator.getSensor(speechSensorName, NLU.class);
        speechActuator = configurator.getActuator(ACTUATOR_SPEECHACTUATOR, SpeechActuator.class);
    }

    @Override
    public boolean init() {

        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + " ms");
            timeout += Time.currentTimeMillis();
        }

        helper = new SimpleNLUHelper(speechSensor, true);
        helper.startListening();
        return true;
    }

    @Override
    public ExitToken execute() {

        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
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
        speechSensor.removeSensorListener(helper);
        return curToken;
    }

    private ExitToken simpleYesNo() {

        if (helper.hasNewUnderstanding()) {
            if (helper.getAllUnderstoodIntents().contains(intentYes)) {
                return tokenSuccessPsYes;
            } else if (helper.getAllUnderstoodIntents().contains(intentNo)) {
                return tokenSuccessPsNo;
            }
        }
        return ExitToken.loop(50);
    }

    private ExitToken confirmYesNo() {

        if (sayingComplete != null) {
            if (!sayingComplete.isDone()) {
                return ExitToken.loop(50);
            } else {
                helper.startListening();
                sayingComplete = null;
            }
        }

        // Ask Again
        if (Time.currentTimeMillis() > nextRepeat) {
            if (timesAsked++ < maxRepeats) {
                try {
                    sayingComplete = speechActuator.sayAsync(confirmText);
                } catch (IOException ex) {
                    logger.error("IO Exception in speechActuator");
                }
                nextRepeat = Time.currentTimeMillis() + timeUntilRepeat;
                return ExitToken.loop(50);
            }
        }

        // Loop if no new Understandings
        if (helper.hasNewUnderstanding()) {

            if (helper.getAllUnderstoodIntents().contains(intentYes)) {
                return tokenSuccessPsYes;
            } else if (helper.getAllUnderstoodIntents().contains(intentNo)) {
                return tokenSuccessPsNo;
            }

            try {
                sayingComplete = speechActuator.sayAsync("Please answer with yes or no!");
            } catch (IOException ex) {
                logger.error("IO Exception in speechActuator");
            }
        }
        return ExitToken.loop(50);

    }
}
