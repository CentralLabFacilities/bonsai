package de.unibi.citec.clf.bonsai.skills;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Read from ReadSlot and write content to WriteSlot.
 *
 * <pre>
 *
 * Parameters:
 *  #_DATA_TYPE: [String]
 *      -> full class-path of the Slot-Type (default: java.lang.String)
 *          e.g. "de.unibi.citec.clf.btl.data.geometry.Point2D"
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
 * @author ffriese, pvonneumanncosel
 */
public class CopyAnySlot extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<?> readSlot;
    private MemorySlotWriter<?> writeSlot;

    private final static String KEY_DATA_TYPE = "#_DATA_TYPE";

    private String typeString = "java.lang.String";
    private Class<?> type;
    private Object object;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        typeString = configurator.requestOptionalValue(KEY_DATA_TYPE, typeString);

        try {
            type = Class.forName(typeString);
        } catch (ClassNotFoundException e) {
            logger.error(e);
            return;
        }
        readSlot = configurator.getReadSlot("ReadSlot", type);
        writeSlot = configurator.getWriteSlot("WriteSlot", type);
    }

    @Override
    public boolean init() {
        try {
            object = readSlot.recall();

            if (object == null) {
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
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if(object == null){
                return tokenError;
            }
            try {
                MemorySlotWriter<Object> slot = (MemorySlotWriter<Object>) writeSlot;
                slot.memorize(type.cast(object));
            } catch (CommunicationException ex) {
                logger.error("Could not memorize slot content");
                return tokenError;
            }
        }
        return curToken;
    }
}
