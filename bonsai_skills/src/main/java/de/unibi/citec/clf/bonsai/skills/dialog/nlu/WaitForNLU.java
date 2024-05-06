package de.unibi.citec.clf.bonsai.skills.dialog.nlu;

import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.SimpleNLUHelper;
import de.unibi.citec.clf.bonsai.util.helper.SimpleSpeechHelper;
import de.unibi.citec.clf.btl.data.speechrec.GrammarNonTerminal;
import de.unibi.citec.clf.btl.data.speechrec.NLU;

import java.util.HashMap;
import java.util.List;

/**
 * Wait for the robot to understand something containing certain intents.
 *
 * <pre>
 *
 * Options:
 *  intents:            [String[]] Required
 *                          -> List of intents to listen for separated by ';'
 *  timeout             [long] Optional (default: -1)
 *                          -> Amount of time waited to understand something
 *
 * Slots:
 *  NLUSlot: [NLU] [Write]
 *      -> Save the understood NLU
 *
 * ExitTokens:
 *  success.{understood}:   intent {understood} given in intents was understood
 *  success.timeout:        Timeout reached (only used when timeout is set to positive value)
 *
 * </pre>
 *
 * @author lruegeme
 */
public class WaitForNLU extends AbstractSkill implements SensorListener<NLU> {

    private static final String KEY_DEFAULT = "intents";
    private static final String KEY_TIMEOUT = "timeout";

    private String[] possible_intents;
    private String speechSensorName = "NLUSensor";
    private long timeout = -1;

    private SimpleNLUHelper helper;

    private ExitToken tokenSuccessPsTimeout;
    private HashMap<String, ExitToken> tokenMap = new HashMap<>();

    private Sensor<NLU> speechSensor;
    private MemorySlotWriter<NLU> nluSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        possible_intents = configurator.requestValue(KEY_DEFAULT).split(";");
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);

        speechSensor = configurator.getSensor(speechSensorName, NLU.class);
        nluSlot = configurator.getWriteSlot("NLUSlot", NLU.class);

        for (String nt : possible_intents) {
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
            timeout += Time.currentTimeMillis();
        }
        helper = new SimpleNLUHelper(speechSensor, true);
        helper.startListening();
        return true;
    }

    @Override
    public ExitToken execute() {

        if (!helper.hasNewUnderstanding()) {

            if (timeout > 0) {
                if (Time.currentTimeMillis() > timeout) {
                    logger.info("timeout reached");
                    return tokenSuccessPsTimeout;
                }
            }

            return ExitToken.loop(50);
        }

        List<NLU> understood = helper.getAllNLUs();
        for (String intent : possible_intents) {
            for (NLU nt : understood) {
                if (intent.equals(nt.getIntent())) {
                    try {
                        nluSlot.memorize(nt);
                    } catch (CommunicationException e) {
                        logger.error("Can not write terminals " + intent.toString() + " to memory.", e);
                        return ExitToken.fatal();
                    }
                    logger.info("understood \"" + nt + "\"");
                    return tokenMap.get(intent);
                }
            }
        }
        return ExitToken.loop(50);
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        speechSensor.removeSensorListener(this);
        return curToken;
    }

    @Override
    public void newDataAvailable(NLU nluEntities) {

    }
}
