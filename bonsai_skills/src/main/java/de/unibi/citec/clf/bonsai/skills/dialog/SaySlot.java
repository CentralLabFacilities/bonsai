package de.unibi.citec.clf.bonsai.skills.dialog;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.speechrec.Language;
import de.unibi.citec.clf.btl.data.speechrec.LanguageType;

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
 * @author rfeldhans
 * @author jkummert
 */
public class SaySlot extends AbstractSkill {

    private static final String SAY_TEXT = "#_MESSAGE";
    private static final String KEY_BLOCKING = "#_BLOCKING";

    private static final String KEY_USE_LANGUAGE = "#_USE_LANGUAGE";
    private static final String REPLACE_STRING = "$S";

    private boolean blocking = true;
    private String sayText = REPLACE_STRING;

    private ExitToken tokenSuccess;

    private MemorySlotReader<String> stringSlot;

    private MemorySlotReader<LanguageType> langSlot = null;

    private SpeechActuator speechActuator;

    private Future<String> sayingComplete;

    @Override
    public void configure(ISkillConfigurator configurator) {
        sayText = configurator.requestOptionalValue(SAY_TEXT, sayText);
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
        stringSlot = configurator.getReadSlot("StringSlot", String.class);

        if (configurator.requestOptionalBool(KEY_USE_LANGUAGE, false)) {
            langSlot = configurator.getReadSlot("Language", LanguageType.class);
        }
    }

    @Override
    public boolean init() {
        Language lang = Language.EN;
        try {
            if (langSlot != null) {
                lang = langSlot.recall().getValue();
            }
        } catch (CommunicationException ex) {
            logger.error("Could not read from language slot", ex);
            return false;
        }


        String sayStr = null;
        try {
            sayStr = stringSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read from String slot", ex);
            return false;
        }

        if (sayStr == null) {
            logger.info("String from slot was not set, will use \"\" and ");
            sayStr = "";
        }

        sayStr = sayText.replaceAll(Matcher.quoteReplacement(REPLACE_STRING), sayStr);
        sayStr = sayStr.replaceAll("_", " ");

        logger.info("saying: " + sayStr);

        try {
            sayingComplete = speechActuator.sayTranslated(sayStr, lang);
        } catch (IOException e) {
            logger.error("Could not call speech actuator");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (!sayingComplete.isDone() && blocking) {
            return ExitToken.loop(50);
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
