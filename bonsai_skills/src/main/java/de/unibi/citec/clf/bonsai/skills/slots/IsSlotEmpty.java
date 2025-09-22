package de.unibi.citec.clf.bonsai.skills.slots;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Reads a StringSlot and returns wether there was content inside
 *
 * <pre>
 *
 * Slots:
 *  StringSlot: [String] [Read]
 *      -> Memory slot the content will be read from
 *
 * ExitTokens:
 *  success.empty:      Entry was empty
 *  success.notEmpty:   Entry was not empty
 *  error:              StringSlot was empty
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class IsSlotEmpty extends AbstractSkill {

    private ExitToken tokenEmpty;
    private ExitToken tokenNotEmpty;

    MemorySlotReader<String> stringSlot;

    boolean empty = false;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenEmpty = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("empty"));
        tokenNotEmpty = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("notEmpty"));

        stringSlot = configurator.getReadSlot("StringSlot", String.class);
    }

    @Override
    public boolean init() {
        String content = "";
        try {
            content = stringSlot.recall();
            if (content == null) {
                empty = true;
                return true;
            }
        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        if(content.equals("")){
            empty = true;
        }
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
