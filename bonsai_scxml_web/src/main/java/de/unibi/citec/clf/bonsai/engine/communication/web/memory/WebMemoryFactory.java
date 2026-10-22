package de.unibi.citec.clf.bonsai.engine.communication.web.memory;

import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.object.WorkingMemory;
import de.unibi.citec.clf.bonsai.memory.MemoryFactory;
import org.apache.log4j.Logger;
import java.io.IOException;

/** Configurable Bonsai factory; owns the lifetime of its web-enabled memory. */
public final class WebMemoryFactory extends MemoryFactory {
    private static final Logger LOG = Logger.getLogger(WebMemoryFactory.class);
    private WebSupportMemory memory;

    @Override
    @SuppressWarnings("unchecked")
    public synchronized <T extends WorkingMemory> T createWorkingMemory(String key)
            throws CoreObjectCreationException {
        if (memory == null) {
            memory = new WebSupportMemory(super.createWorkingMemory(key));
        }
        return (T) memory;
    }

    @Override public synchronized void cleanUp() {
        if (memory != null) {
            try { memory.close(); }
            catch (IOException failure) { LOG.warn("Could not clean up web memory", failure); }
            finally { memory = null; }
        }
        super.cleanUp();
    }
}
