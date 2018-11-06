package de.unibi.citec.clf.bonsai.skills.slots;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Read from ReadSlot and write content to WriteSlot.
 * Will write an empty String to the writeSlot if readSlot == null.
 *
 * <pre>
 *
 * Slots:
 *  ReadSlot: [String] [Read]
 *      -> Memory slot the content will be read from
 *  WriteSlot: [String] [Write]
 *      -> Memory slot the content will be written to
 *
 * ExitTokens:
 *  success:    Copy was successful
 *  error:      Copy was not successful
 *
 * Sensors:
 *
 * Actuators:
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class CopySlot extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    MemorySlotReader<String> readSlot;
    MemorySlotWriter<String> writeSlot;

    private String slotContent;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        readSlot = configurator.getReadSlot("ReadSlot", String.class);
        writeSlot = configurator.getWriteSlot("WriteSlot", String.class);
    }

    @Override
    public boolean init() {
        try {
            slotContent = readSlot.recall();

            if (slotContent == null) {
                logger.debug("your ReadSlot was empty");
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if(slotContent == null){
                return tokenError;
            }
            try {
                writeSlot.memorize(slotContent);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize slotcontent");
                return tokenError;
            }
        }
        return curToken;
    }
}
