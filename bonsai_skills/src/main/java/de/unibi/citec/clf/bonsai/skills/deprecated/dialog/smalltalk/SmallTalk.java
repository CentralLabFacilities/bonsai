package de.unibi.citec.clf.bonsai.skills.deprecated.dialog.smalltalk;


import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.SimpleSpeechHelper;
import de.unibi.citec.clf.btl.data.speechrec.Utterance;
import java.util.Set;

/**
 *
 * @author dnacke
 * @author ikillman
 */
public class SmallTalk extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccessJoke;
    private ExitToken tokenSuccessTime;
    private ExitToken tokenSuccessWeather;

    /*
     * Sensors used by this state.
     */
    private Sensor<Utterance> speechSensor;

    /**
     * SpeechManager used for understanding etc.
     */
    private SimpleSpeechHelper speechManager;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccessJoke = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("joke"));
        tokenSuccessTime = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("time"));
        tokenSuccessWeather = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("weather"));
        speechSensor = configurator.getSensor("SpeechSensor",
                Utterance.class);
    }

    @Override
    public boolean init() {
        speechManager = new SimpleSpeechHelper(speechSensor, true);
        speechManager.startListening();

        logger.info("Waiting for commands ...");
        return true;
    }

    @Override
    public ExitToken execute() {
        if (!speechManager.hasNewUnderstanding()) {
            return ExitToken.loop();
        }

        Set<String> understood = speechManager.getNonTerminals();
        logger.info("understood: " + understood);
        if (understood.contains("joke")) {
            return tokenSuccessJoke;
        } else if (understood.contains("time")) {
            return tokenSuccessTime;
        } else if (understood.contains("weather")) {
            return tokenSuccessWeather;
        } else {
            logger.debug("Understood nothing");
        }

        return ExitToken.loop();

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        speechManager.removeHelper();
        return curToken;
    }

}
