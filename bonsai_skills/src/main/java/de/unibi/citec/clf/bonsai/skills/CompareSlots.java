package de.unibi.citec.clf.bonsai.skills;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
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
public class CompareSlots extends AbstractSkill {

    private ExitToken tokenMisMatch;
    private ExitToken tokenMatch;
    private ExitToken tokenError;


    MemorySlotReader<String> readSlotOne;
    MemorySlotReader<String> readSlotTwo;

    private String slotContentOne;
    private String slotContentTwo;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenMatch = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("match"));
        tokenMisMatch = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("misMatch"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        readSlotOne = configurator.getReadSlot("ReadSlotOne", String.class);
        readSlotTwo = configurator.getReadSlot("ReadSlotTwo", String.class);
    }

    @Override
    public boolean init() {
        try {
            slotContentOne = readSlotOne.recall();
            slotContentTwo = readSlotTwo.recall();

            if (slotContentOne == null) {
                logger.warn("your ReadSlot One was empty");
            }
            if (slotContentTwo == null) {
                logger.warn("your ReadSlot Two was empty");
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (slotContentOne == null) {
            return tokenError;
        }
        if (slotContentTwo == null) {
            return tokenError;
        }
        if (slotContentOne.equals(slotContentTwo)) {
            return tokenMatch;
        }
        return tokenMisMatch;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
