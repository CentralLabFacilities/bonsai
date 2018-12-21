package de.unibi.citec.clf.bonsai.skills.deprecated.dialog.unsupported;


import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.SimpleSpeechHelper;
import de.unibi.citec.clf.btl.data.speechrec.Utterance;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * This Skill asks for confirmation.
 *
 * <pre>
 * options:
 * (optional) #_TIMEOUT(ms) -> enable timeout after x ms
 * (optional) #_USESIMPLE(bool) -> use simple confirm (default true)
 * (optional) #_TEXT -> confirm text (default "Was that correct?")
 * (optional) #_REPEAT_AFTER(ms) -> time until TOBI repeats #_TEXT
 * (optional) #_REPEATS -> max # of repeats
 *
 * slots:
 *
 * possible return states are:
 * success.confirmYes -> if confirmation was yes.
 * success.confirmNo -> if confirmation was no.
 * success.timeout -> timeout.
 * fatal -> a hard error occurred e.g. Slot communication error.
 *
 * this skill loops till confirmation is given. If nonsimple tobi asks for
 * confirmation. Default is no timeout.
 * </pre>
 *
 *
 * @author hterhors, prenner, lkettenb, ssharma, lruegeme
 */
public class SpeechRepeat extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessJokeTobi;
    private ExitToken tokenSuccessTobiSink;
    private ExitToken tokenSuccessBironSink;

    // used tokens

    /**
     *
     */
    private static final String KEY_TEXT = "#_TEXT";
    private static final String KEY_SIMPLE = "#_USESIMPLE";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_REPEAT = "#_REPEAT_AFTER";
    private static final String KEY_MAXREP = "#_REPEATS";

    private static final String ACTUATOR_SPEECHACTUATOR = "SpeechActuator";
    private static final String SENSOR_SPEECHSENSOR = "SpeechSensor";

    private static final String PS_TIMEOUT = "timeout";
    private static final String PS_YES = "confirmYes";
    private static final String PS_NO = "confirmNo";
    private static final String NT_NO = "confirm_no";
    private static final String NT_YES = "confirm_yes";
    private static final String tobi_sink = "tobi_sink";
    private static final String biron_sink = "biron_sink";
    private static final String joke_tobi = "joke_tobi";

    // Default Values
    private boolean simpleYesOrNo = true;
    private long timeout = 1000;
    private long timeUntilRepeat = 5000;
    private int maxRepeats = 1;
    private String confirmText = "Was that correct?";

    private Sensor<Utterance> speechSensor;
    private SimpleSpeechHelper speechManager;
    private SpeechActuator speechActuator;

    private long nextRepeat = 0;
    private int timesAsked = 0;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessJokeTobi = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(joke_tobi));
        tokenSuccessTobiSink = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(tobi_sink));
        tokenSuccessBironSink = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(biron_sink));

        // request all tokens that you plan to return from other methods
        speechSensor = configurator.getSensor(SENSOR_SPEECHSENSOR, Utterance.class);
        speechActuator = configurator.getActuator(ACTUATOR_SPEECHACTUATOR, SpeechActuator.class);
    }

    @Override
    public boolean init() {
        speechManager = new SimpleSpeechHelper(speechSensor, true);
        if (timeout > 0) {
            logger.info("using timeout of " + timeout + "ms");
            timeout += Time.currentTimeMillis();
        }

        speechManager.startListening();

        logger.debug("simple: " + simpleYesOrNo);

        return true;
    }

    @Override
    public ExitToken execute() {

            return simpleYesNo();


    }

    @Override
    public ExitToken end(ExitToken curToken) {
        speechManager.removeHelper();
        return curToken;
    }

    private ExitToken simpleYesNo() {

        if (!speechManager.hasNewUnderstanding()) {
            return ExitToken.loop();
        }
        try {
            if (!speechManager.getUnderstoodWords(joke_tobi).isEmpty()) {
                speechActuator.say("Tobi tell me a joke!");
                return tokenSuccessJokeTobi;
            } else if (!speechManager.getUnderstoodWords(tobi_sink).isEmpty()) {
                speechActuator.say("Tobi go to the sink!");
                return tokenSuccessTobiSink;
            } else if (!speechManager.getUnderstoodWords(biron_sink).isEmpty()) {

                speechActuator.say("Biron go to the sink!");
                return tokenSuccessBironSink;

            }
        } catch (IOException ex) {
            Logger.getLogger(SpeechRepeat.class.getName()).log(Level.SEVERE, null, ex);
        }
        return ExitToken.loop();

    }

}
