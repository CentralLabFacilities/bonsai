package de.unibi.citec.clf.bonsai.skills.dialog;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.SimpleSpeechHelper;
import de.unibi.citec.clf.btl.data.speechrec.GrammarNonTerminal;
import de.unibi.citec.clf.btl.data.speechrec.Utterance;

import java.util.HashMap;
import java.util.List;

/**
 * Wait for the robot to understand something containing certain nonterminals.
 *
 * <pre>
 *
 * Options:
 *  #_NONTERMINALS:     [String[]] Required
 *                          -> List of nonterminals to listen for seperated by ';'
 *  #_SENSOR:           [String] Optional (default: "SpeechSensor")
 *                          -> Name of the speech sensor to use for understanding
 *  #_TIMEOUT           [long] Optional (default: -1)
 *                          -> Amount of time waited to understand something
 *
 * Slots:
 *  StringSlot: [String] [Write]
 *      -> Save all terminals that are children of the understood nonterminal
 *
 * ExitTokens:
 *  success.{understood}:   Nonterminal {understood} given in #_NONTERMINALS was understood
 *  success.timeout:        Timeout reached (only used when #_TIMEOUT is set to positive value)
 *
 * Sensors:
 *  #_SENSOR: [Utterance]
 *      -> Used to listen for new understandings
 *
 * Actuators:
 *
 * </pre>
 *
 * @author lkettenb, lruegeme
 * @author jkummert
 * @author rfeldhans
 */
public class WaitForNonterminals extends AbstractSkill {

    private static final String KEY_DEFAULT = "#_NONTERMINALS";
    private static final String KEY_SENSOR = "#_SENSOR";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";

    private String[] nonterminals;
    private String speechSensorName = "SpeechSensor";
    private long timeout = -1;

    private ExitToken tokenSuccessPsTimeout;
    private HashMap<String, ExitToken> tokenMap = new HashMap<>();

    private Sensor<Utterance> speechSensor;
    private SimpleSpeechHelper speechManager;
    private MemorySlotWriter<String> TerminalSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        nonterminals = configurator.requestValue(KEY_DEFAULT).split(";");
        speechSensorName = configurator.requestOptionalValue(KEY_SENSOR, speechSensorName);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);

        speechSensor = configurator.getSensor(speechSensorName, Utterance.class);
        TerminalSlot = configurator.getWriteSlot("StringSlot", String.class);

        for (String nt : nonterminals) {
            tokenMap.put(nt, configurator.requestExitToken(ExitStatus.SUCCESS().ps(nt)));
        }

        if (timeout > 0) {
            tokenSuccessPsTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        }
    }

    @Override
    public boolean init() {

        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + " ms");
            timeout += System.currentTimeMillis();
        }
        speechManager = new SimpleSpeechHelper(speechSensor, true);

        speechManager.startListening();

        return true;
    }

    @Override
    public ExitToken execute() {

        if (!speechManager.hasNewUnderstanding()) {

            if (timeout > 0) {
                if (System.currentTimeMillis() > timeout) {
                    logger.info("timeout reached");
                    return tokenSuccessPsTimeout;
                }
            }

            return ExitToken.loop(50);
        }

        List<GrammarNonTerminal> understood = speechManager.getNonTerminalNodes();
        String terminals = "";
        for (String nonterminal : nonterminals) {
            for (GrammarNonTerminal nt : understood) {
                if (nt.getName().equals(nonterminal)) {
                    try {
                        for (String s : speechManager.getSubStrings(nt)) {
                            terminals = terminals.concat(" ").concat(s);
                        }
                        terminals = terminals.replaceFirst(" ", "");
                        TerminalSlot.memorize(terminals);
                    } catch (CommunicationException e) {
                        logger.error("Can not write terminals " + nonterminal + " to memory.", e);
                        return ExitToken.fatal();
                    }
                    logger.info("understood \"" + terminals + "\"");
                    return tokenMap.get(nonterminal);
                }
            }
        }
        return ExitToken.loop(50);
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        speechManager.removeHelper();
        return curToken;
    }
}
