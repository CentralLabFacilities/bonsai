package de.unibi.citec.clf.bonsai.skills;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Read from ReadSlot and compare to compareString.
 *
 * <pre>
 *
 * Slots:
 *  ReadSlot: [String] [Read]
 *      -> Memory slot the content will be read from
 *
 * ExitTokens:
 *  success.match:      Entrys are the same
 *  success.mismatch:   Entrys are not the same
 *  error:              ReadSlot was empty
 *
 * Sensors:
 *
 * Actuators:
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class CompareSlot extends AbstractSkill {

    private ExitToken tokenMisMatch;
    private ExitToken tokenMatch;
    private ExitToken tokenError;

    private static final String KEY_COMPARE_STRING = "#_COMPARE_STRING";

    MemorySlotReader<String> readSlot;

    private String slotContent;
    private String compareString;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenMatch = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("match"));
        tokenMisMatch = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("misMatch"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        readSlot = configurator.getReadSlot("ReadSlot", String.class);
        compareString = configurator.requestValue(KEY_COMPARE_STRING);
    }

    @Override
    public boolean init() {
        try {
            slotContent = readSlot.recall();

            if (slotContent == null) {
                logger.warn("your ReadSlot was empty");
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (slotContent.equals(compareString)) {
            return tokenMatch;
        }
        return tokenMisMatch;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if(slotContent == null){
                return tokenError;
            }
        }
        return curToken;
    }
}
