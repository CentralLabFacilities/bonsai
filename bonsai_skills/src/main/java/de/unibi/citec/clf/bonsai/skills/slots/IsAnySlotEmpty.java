package de.unibi.citec.clf.bonsai.skills.slots;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Reads a slot and returns whether it was empty.
 * Also treats empty strings as empty
 *
 * <pre>
 *
 * Slots:
 *  slot: [*] [Read]
 *      -> Memory slot the content will be read from
 *
 * ExitTokens:
 *  success.empty:      Slot was empty
 *  success.notEmpty:   Slot was not empty
 *
 * </pre>
 *
 * @author pvonneumanncosel, lgraesner
 */
public class IsAnySlotEmpty extends AbstractSkill {

    private ExitToken tokenEmpty;
    private ExitToken tokenNotEmpty;
    private ExitToken tokenError;

    MemorySlotReader<Object> slot;

    boolean empty = false;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenEmpty = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("empty"));
        tokenNotEmpty = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("notEmpty"));

        slot = configurator.getReadSlot("slot", Object.class);
    }

    @Override
    public boolean init() {
        Object content = null;
        try {
            content = slot.recall();
            if (content == null) {
                empty = true;
            }
        } catch (CommunicationException ex) {
            empty = true;
            logger.fatal("Unable to read from memory: ", ex);
        }

        if (content instanceof String) empty = ((String) content).isEmpty();

        return true;
    }

    @Override
    public ExitToken execute() {
        if(empty){
            return tokenEmpty;
        } else {
            return tokenNotEmpty;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
