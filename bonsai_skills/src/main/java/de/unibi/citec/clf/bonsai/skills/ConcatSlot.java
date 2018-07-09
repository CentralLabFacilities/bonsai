package de.unibi.citec.clf.bonsai.skills;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Append a string to a slot.
 *
 * <pre>
 *
 * Slots:
 *  StringSlot: [String] [Read/Write]
 *      -> Memory slot the content will be appended to
 *
 * ExitTokens:
 *  success:            Successfully appended to slot
 *
 * Sensors:
 *
 * Actuators:
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class ConcatSlot extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private static final String KEY_APPEND = "#_APPEND";

    MemorySlotReader<String> readSlot;
    MemorySlotWriter<String> writeSlot;

    private String slotContent;
    private String appendString;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        readSlot = configurator.getReadSlot("StringSlot", String.class);
        writeSlot = configurator.getWriteSlot("StringSlot", String.class);
        appendString = configurator.requestValue(KEY_APPEND);
    }

    @Override
    public boolean init() {
        try {
            slotContent = readSlot.recall();

            if (slotContent == null) {
                logger.warn("The slot was empty");
                slotContent = "";
            }
        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }

        if (appendString.isEmpty()) {
            logger.error("Nothing to append");
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        slotContent += appendString;
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                writeSlot.memorize(slotContent);
            } catch (CommunicationException e) {
                logger.fatal("Could not write to memory");
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
