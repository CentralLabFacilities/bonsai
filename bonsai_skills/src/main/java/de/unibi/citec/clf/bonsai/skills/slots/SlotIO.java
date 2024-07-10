package de.unibi.citec.clf.bonsai.skills.slots;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Writes a String to a Slot
 *
 * <pre>
 *
 * Slots:
 *  StringSlot: [String] [Write]
 *      -> Target Memory slot
 *
 * Options:
 *  #_WRITE [String]
 *      -> the String to be written
 *
 * ExitTokens:
 *  success:    Write was successful
 *  error:      Could not access slot
 *
 * </pre>
 */

public class SlotIO extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private static final String KEY_WRITE = "#_WRITE";

    // Defaults
    private String write = "";
    private String content = "";

    MemorySlot<String> stringSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        write = configurator.requestValue(KEY_WRITE);
        stringSlot = configurator.getReadWriteSlot("StringSlot", String.class);

    }

    @Override
    public boolean init() {
        try {
            content = stringSlot.recall();
        } catch (CommunicationException ex) {
            logger.error(ex.getMessage());
        }
        if(content == null) content = "";

        return true;
    }

    @Override
    public ExitToken execute() {
        logger.debug("current data:"+content);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (write.isEmpty()) {
            logger.warn("Write is empty, slot will not be affected"); //Old hack, may be unintended behaviour
            return curToken;
        }
        try {
            stringSlot.memorize(write);
            logger.debug("wrote '"+write+"' to slot");
        } catch (CommunicationException ex) {
            logger.fatal("Unable to write to memory: " + ex.getMessage());
            return ExitToken.fatal();
        }
        return curToken;

    }
}
