package de.unibi.citec.clf.bonsai.skills.slots;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;

import java.lang.reflect.InvocationTargetException;

/**
 * Clear content of any List.
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
 * @author lruegeme
 */

public class ClearList<L extends List > extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    // Defaults
    private L read;

    MemorySlotWriter<L> slot;

    private final static String KEY_LIST_TYPE = "#_LIST_TYPE";
    private Class<L> listType;

    @Override
    public void configure(ISkillConfigurator configurator) {

        String listTypeString = configurator.requestValue(KEY_LIST_TYPE);

        try {
            listType = (Class<L>) Class.forName(listTypeString);
        } catch (ClassNotFoundException e) {
            throw new ConfigurationException(e);
        }

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        slot = configurator.getWriteSlot("List", listType);

    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            slot.memorize( listType.getDeclaredConstructor().newInstance() );
        } catch (CommunicationException | InvocationTargetException | InstantiationException | IllegalAccessException | NoSuchMethodException e) {
            logger.error(e.getMessage());
            return ExitToken.fatal();
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;

    }
}
