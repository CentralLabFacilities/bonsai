package de.unibi.citec.clf.bonsai.skills.slots;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.Type;

/**
 * Pushes (Appends) an item to the back of a List.
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
 *  ItemSlot: [T] [Read]
 *      -> Memory slot the content will be Read from
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
public class PushList<T extends Type, L extends List<T>> extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlot<L> listSlot;
    private MemorySlotReader<T> itemSlot;

    private final static String KEY_DATA_TYPE = "#_DATA_TYPE";
    private final static String KEY_LIST_TYPE = "#_LIST_TYPE";

    private Class<L> listType;
    private Class<T> type;

    L list;
    T item;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        String typeString = configurator.requestValue(KEY_DATA_TYPE);
        String listTypeString = configurator.requestValue(KEY_LIST_TYPE);

        try {
            type = (Class<T>) Class.forName(typeString);
            listType = (Class<L>) Class.forName(listTypeString);
        } catch (ClassNotFoundException e) {
            logger.error(e);
            return;
        }
        itemSlot = configurator.getReadSlot("ItemSlot", type);
        listSlot = configurator.getSlot("ListSlot", listType);

    }


    @Override
    public boolean init() {
        try {
            list = listSlot.recall();
            item = itemSlot.recall();

            if (list == null) {
                logger.warn("your List was null, creating");
                try {
                    list = listType.newInstance();
                } catch (InstantiationException e) {
                    throw new RuntimeException(e);
                } catch (IllegalAccessException e) {
                    throw new RuntimeException(e);
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        logger.info("adding: " + item);
        list.add(item);
        logger.info("list now contains " + list.size() + " items");

        try {
            listSlot.memorize(list);

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
