package de.unibi.citec.clf.bonsai.engine.communication.web.memory;

import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.object.WorkingMemory;
import de.unibi.citec.clf.bonsai.memory.MemoryFactory;

import java.util.function.Consumer;

/** Optional memory factory installed through BonsaiConfiguration.xml. */
public final class WebMemoryFactory extends MemoryFactory {
    // Bonsai runs one configured working memory per process in the web starter.
    private static volatile WebSupportMemory active;
    private static volatile Consumer<WebSupportMemory.SlotChange> observer = change -> { };
    private WebSupportMemory memory;

    public static synchronized void setSlotListener(Consumer<WebSupportMemory.SlotChange> listener) {
        observer = listener == null ? change -> { } : listener;
        if (active != null) active.setSlotListener(observer);
    }
    public static WebSupportMemory currentMemory() { return active; }

    @Override @SuppressWarnings("unchecked")
    public synchronized <T extends WorkingMemory> T createWorkingMemory(String key)
            throws CoreObjectCreationException {
        if (memory == null) {
            memory = new WebSupportMemory(super.createWorkingMemory(key));
            memory.setSlotListener(observer);
            active = memory;
        }
        return (T) memory;
    }

    @Override public synchronized void cleanUp() {
        if (active == memory) active = null;
        memory = null;
        super.cleanUp();
    }
}
