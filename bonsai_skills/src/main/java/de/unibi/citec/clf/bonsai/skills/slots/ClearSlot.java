package de.unibi.citec.clf.bonsai.skills.slots;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Clear content of StringSlot.
 *
 * <pre>
 *
 * Slots:
 *  StringSlot: [String] [Read/Write]
 *      -> Memory slot the content will be cleared from
 *
 * ExitTokens:
 *  success:            Cleared slot successfully
 *  fatal:              Error while writing to memory
 *
 * Sensors:
 *
 * Actuators:
 *
 * </pre>
 *
 * @author dleins
 */

public class ClearSlot extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    // Defaults
    private String read;

    MemorySlot<String> slot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        slot = configurator.getSlot("StringSlot", String.class);

    }

    @Override
    public boolean init() {
        try {
            read = slot.recall();
        } catch (CommunicationException ex) {
            logger.error(ex.getMessage());
        }
        if(read == null) read = "";

        return true;
    }

    @Override
    public ExitToken execute() {
        logger.debug("current data: '"+read+ "' will be cleared from slot");
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        try {
            slot.memorize("");
        } catch (CommunicationException ex) {
            logger.fatal("Unable to write to memory: " + ex.getMessage());
            return ExitToken.fatal();
        }
        return curToken;

    }
}
