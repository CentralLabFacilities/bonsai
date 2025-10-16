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
import de.unibi.citec.clf.btl.Type;

/**
 * Removes (Pops) the last item from a List and writes the content to itemSlot.
 *
 * <pre>
 *
 * Parameters:
 *  #_DATA_TYPE: [String]
 *      -> full class-path of the Slot-Type
 *          e.g. "de.unibi.citec.clf.btl.data.geometry.Point2D"
 *   #_LIST_TYPE: [String]
 *      -> full class-path of the List-Type
 *          e.g. "de.unibi.citec.clf.btl.data.geometry.Point2D"
 *
 * Slots:
 *  ListSlot: [L] [R/W]
 *      -> Memory slot of the List
 *  ItemSlot: [T] [Write]
 *      -> Memory slot the content will be written to
 *
 * ExitTokens:
 *  success:        Popped an Item
 *  error.empty:    List was Empty
 *
 * Sensors:
 *
 * Actuators:
 *
 * </pre>
 *
 * @author lruegeme
 */
public class PopList<T extends Type, L extends List<T>> extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlot<L> listSlot;
    private MemorySlotWriter<T> itemSlot;

    private final static String KEY_DATA_TYPE = "#_DATA_TYPE";
    private final static String KEY_LIST_TYPE = "#_LIST_TYPE";

    private Class<L> listType;
    private Class<T> type;

    L list;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR().ps("empty"));

        String typeString = configurator.requestValue(KEY_DATA_TYPE);
        String listTypeString = configurator.requestValue(KEY_LIST_TYPE);

        try {
            type = (Class<T>) Class.forName(typeString);
            listType = (Class<L>) Class.forName(listTypeString);
        } catch (ClassNotFoundException e) {
            logger.error(e);
            throw new ConfigurationException(e);
        }
        itemSlot = configurator.getWriteSlot("ItemSlot", type);
        listSlot = configurator.getSlot("ListSlot", listType);
    }


    @Override
    public boolean init() {
        try {
            list = listSlot.recall();

            if (list == null) {
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
        int s = list.size();
        logger.info("List currently has " + s + " items" );

        if (list.isEmpty()) return tokenError;
        T item = list.remove(s-1);
        logger.info("popped: " + item);

        try {
            listSlot.memorize(list);
            itemSlot.memorize(item);
        } catch (CommunicationException e) {
            throw new RuntimeException(e);
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
