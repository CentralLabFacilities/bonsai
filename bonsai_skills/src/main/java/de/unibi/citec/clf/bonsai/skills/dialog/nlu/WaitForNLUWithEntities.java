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
import de.unibi.citec.clf.btl.data.speechrec.NLU;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;

/**
 * Wait for the robot to understand something containing certain intents.
 *
 * <pre>
 *
 * Options:
 *  #_INTENT:            [String] Required
 *                          -> the intents to listen for
 *  #_ENTITIES           [String[]] Required
 *                          -> List of required entities separated by ';'
 *  #_TIMEOUT:           [long] Optional (default: -1)
 *                          -> Amount of time waited to understand something
 *
 * Slots:
 *  NLUSlot: [NLU] [Write]
 *      -> Save the understood NLU
 *
 * ExitTokens:
 *  success:                    intent was understood
 *  error.missing               intent was understood but a required entity was missing
 *  error.timeout:              Timeout reached (only used when timeout is set to positive value)
 *
 * </pre>
 *
 * @author lruegeme
 */
public class WaitForNLUWithEntities extends AbstractSkill implements SensorListener<NLU> {

    private static final String KEY_DEFAULT = "INTENT";
    private static final String KEY_ENTITY = "ENTITIES";
    private static final String KEY_TIMEOUT = "TIMEOUT";

    private String intent;
    private List<String> required_entities;
    private String speechSensorName = "NLUSensor";
    private long timeout = -1;

    private SimpleNLUHelper helper;

    private ExitToken tokenErrorPsTimeout;
    private ExitToken tokenSuccess;
    private ExitToken tokenMissing;

    private Sensor<NLU> speechSensor;
    private MemorySlotWriter<NLU> nluSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        intent = configurator.requestValue(KEY_DEFAULT);
        required_entities = Arrays.stream(configurator.requestValue(KEY_ENTITY).split(";")).toList();
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);

        speechSensor = configurator.getSensor(speechSensorName, NLU.class);
        nluSlot = configurator.getWriteSlot("NLUSlot", NLU.class);

        tokenMissing = configurator.requestExitToken(ExitStatus.ERROR().ps("missing"));
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        if (timeout > 0) {
            tokenErrorPsTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"));
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
                    return tokenErrorPsTimeout;
                }
            }

            return ExitToken.loop(50);
        }

        List<NLU> understood = helper.getAllNLUs();

        for (NLU nt : understood) {
            if (intent.equals(nt.getIntent())) {
                logger.info("understood \"" + nt + "\"");
                if (nt.hasAllEntities(required_entities)) {
                    try {
                        nluSlot.memorize(nt);
                    } catch (CommunicationException e) {
                        logger.error("Can not write terminals " + intent.toString() + " to memory.", e);
                        return ExitToken.fatal();
                    }

                    return tokenSuccess;
                } else {
                    logger.error("missing one of the required entities " + required_entities.toString());
                    return tokenMissing;
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
