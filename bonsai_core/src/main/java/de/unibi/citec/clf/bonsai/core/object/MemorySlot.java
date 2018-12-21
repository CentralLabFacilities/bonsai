package de.unibi.citec.clf.bonsai.core.object;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;


/**
 * Interface for communication objects that can store or request information
 * to/from a (runtime-) persistent storage unit.
 *
 * @param <T> Data type of the content that should be memorized in the working
 *            memory.
 * @author lziegler
 */
public interface MemorySlot<T> extends ManagedCoreObject, MemorySlotReader<T>, MemorySlotWriter<T> {

    /**
     * Put an information object into the storage.
     *
     * @param <S>
     * @param object The information to store.
     * @throws CommunicationException When the communication with the storage unit fails.
     */
    @Override
    <S extends T> void memorize(S object) throws CommunicationException;

    /**
     * Delete the previously stored information from the storage.
     *
     * @throws CommunicationException When the communication with the storage unit fails.
     */
    void forget() throws CommunicationException;

    /**
     * Return the previously stored information from the storage.
     *
     * @param <S>
     * @return A copy of the previously stored information object.
     * @throws CommunicationException When the communication with the storage unit fails.
     */
    @Override
    <S extends T> T recall() throws CommunicationException;

    <S extends T> Class<S> getDataType();
}
