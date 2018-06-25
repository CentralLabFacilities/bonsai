
package de.unibi.citec.clf.bonsai.memory;

import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.WorkingMemory;
import de.unibi.citec.clf.bonsai.memory.slots.ObjectSlot;
import org.apache.log4j.Logger;

import java.util.HashMap;

/**
 * @author lruegeme
 */
public class DefaultMemory implements WorkingMemory {

    private HashMap<String, MemorySlot> memorySlots = new HashMap<>();
    private final Logger logger = Logger.getLogger(getClass());

    @Override
    public void configure(IObjectConfigurator conf) throws ConfigurationException {
        //no configuration needed
    }

    @Override
    public <T> MemorySlot<T> getSlot(String slotName, Class<T> dataType) throws CommunicationException, IllegalArgumentException, CoreObjectCreationException {
        logger.debug("getSlot " + slotName + "[" + dataType + "]");
        MemorySlot<T> slot;
        if (memorySlots.containsKey(slotName)) {
            logger.trace("using old slot");
            slot = memorySlots.get(slotName);
            if (slot.getDataType() != dataType) {
                throw new CommunicationException("Slot [" + slotName + "] already in memory with type [" + slot.getDataType() + "] but type [" + dataType + "] was requested");
            }
        } else {
            logger.debug("create new slot");
            slot = new ObjectSlot<>(dataType);
            memorySlots.put(slotName, slot);
        }
        logger.trace("have " + memorySlots.size() + " slots");
        return slot;
    }

    @Override
    public void cleanUp() {
        //no cleanup
    }

}
