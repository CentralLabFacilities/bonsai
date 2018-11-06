package de.unibi.citec.clf.bonsai.skills.slots;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.Type;

/**
 * Read a List from ReadSlot and write the content to WriteSlot.
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
public class CopyListSlot extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<List<? extends Type>> readSlot;
    private MemorySlotWriter<List<? extends Type>> writeSlot;

    private final static String KEY_DATA_TYPE = "#_DATA_TYPE";

    private Class<List<? extends Type>> listType;
    private List<? extends Type> object;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        String typeString = configurator.requestValue(KEY_DATA_TYPE);

        try {
            Class<? extends Type> type = (Class<? extends Type>) Class.forName(typeString);
            listType = (Class<List<? extends Type>>)new List<>(type).getClass();
        } catch (ClassNotFoundException e) {
            logger.error(e);
            return;
        }
        readSlot = configurator.getReadSlot("ReadListSlot", listType);
        writeSlot = configurator.getWriteSlot("WriteListSlot", listType);
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
                writeSlot.memorize(listType.cast(object));
            } catch (CommunicationException ex) {
                logger.error("Could not memorize slot content");
                return tokenError;
            }
        }
        return curToken;
    }
}
