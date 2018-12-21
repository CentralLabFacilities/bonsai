package de.unibi.citec.clf.bonsai.core.object;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;

/**
 * @author lruegeme
 */
public interface MemorySlotWriter<T> {

    <S extends T> void memorize(S object) throws CommunicationException;

}
