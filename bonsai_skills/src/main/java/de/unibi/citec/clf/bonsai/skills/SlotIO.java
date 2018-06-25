package de.unibi.citec.clf.bonsai.skills;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.util.logging.Level;
import java.util.logging.Logger;


public class SlotIO extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private static final String KEY_WRITE = "#_WRITE";

    // Defaults
    private String write = "";
    private String read ="";

    MemorySlot<String> slot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        write = configurator.requestOptionalValue(KEY_WRITE, write);
        slot = configurator.getSlot("StringSlot", String.class);

    }

    @Override
    public boolean init() {
        try {
            read = slot.recall();
        } catch (CommunicationException ex) {
            Logger.getLogger(SlotIO.class.getName()).log(Level.SEVERE, null, ex);
        }
        if(read == null) read = "";

        return true;
    }

    @Override
    public ExitToken execute() {
        logger.debug("current data:"+read);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (write.isEmpty()) {
            return curToken;
        }

        logger.debug("write <"+write+"> to slot");
        try {
            slot.memorize(write);
        } catch (CommunicationException ex) {
            logger.fatal("Unable to write to memory: " + ex.getMessage());
            return ExitToken.fatal();
        }
        return curToken;

    }
}