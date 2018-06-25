package de.unibi.citec.clf.bonsai.core.object;



import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import java.util.Map;

import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.exception.InitializationException;

/**
 * Interface for factories that create {@link MemorySlot} objects that allow
 * access to distinct information inside a (runtime-) persistent storage unit.
 * 
 * @author lziegler
 * 
 */
public interface WorkingMemory extends ManagedCoreObject {

    /**
     * Creates a communication object that allows access to distinct information
     * inside the storage unit.
     * 
     * @param slotName
     *            A unique identifier for the information that should be stored
     *            or accessed.
     * @param dataType
     *            The type of the data that should be stored or accessed.
     * @return A {@link MemorySlot} object that grant access to the data
     *         identified by parameter slotName.
     * @throws CommunicationException
     *             When the communication with the storage unit fails.
     * @throws IllegalArgumentException
     *             When the configuration of the working memory does not allow
     *             to create the desired slot.
     * @throws CoreObjectCreationException
     *             When an error occurred while creating the requested slot.
     */
    <T> MemorySlot<T> getSlot(String slotName, Class<T> dataType) throws CommunicationException,
            IllegalArgumentException, CoreObjectCreationException;
}
