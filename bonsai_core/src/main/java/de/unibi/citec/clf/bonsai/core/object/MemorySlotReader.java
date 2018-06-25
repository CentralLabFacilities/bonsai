package de.unibi.citec.clf.bonsai.core.object;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;

/**
 *
 * @author lruegeme
 */
public interface MemorySlotReader<T> {
    
    <S extends T> T recall() throws CommunicationException;
    
}
