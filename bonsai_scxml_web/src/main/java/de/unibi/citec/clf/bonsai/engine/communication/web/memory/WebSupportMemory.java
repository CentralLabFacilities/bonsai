package de.unibi.citec.clf.bonsai.engine.communication.web.memory;

import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.WorkingMemory;
import org.apache.log4j.Logger;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;

/** Web-observable working memory. Storage stays in the ordinary Bonsai memory. */
public final class WebSupportMemory implements WorkingMemory {
    public record SlotChange(String path, String dataType, String before, String after,
                             boolean beforeKnown, boolean cleared, boolean registered,
                             boolean known, boolean valueIsNull, boolean beforeIsNull) { }
    public record SlotValue(String dataType, String value, boolean known, boolean cleared, boolean valueIsNull) { }

    private static final Logger LOG = Logger.getLogger(WebSupportMemory.class);
    private final WorkingMemory delegate;
    private final Map<String, ObservedSlot<?>> slots = new LinkedHashMap<>();
    private volatile Consumer<SlotChange> listener = change -> { };

    public WebSupportMemory(WorkingMemory delegate) { this.delegate = Objects.requireNonNull(delegate); }
    public synchronized void setSlotListener(Consumer<SlotChange> listener) {
        this.listener = Objects.requireNonNull(listener);
    }

    /** Copy the printable value at write time, never retain a mutable object reference. */
    private static String freeze(Object value) {
        try { return String.valueOf(value); }
        catch (RuntimeException failure) {
            LOG.warn("Slot cannot be rendered as text", failure);
            return "<unavailable>";
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public synchronized <T> MemorySlot<T> getSlot(String path, Class<T> dataType)
            throws CommunicationException, CoreObjectCreationException {
        // Delegate first: original memory enforces consistent slot types.
        MemorySlot<T> raw = delegate.getSlot(path, dataType);
        ObservedSlot<?> cached = slots.get(path);
        if (cached != null) return (MemorySlot<T>) cached;
        ObservedSlot<T> slot = new ObservedSlot<>(path, raw);
        slots.put(path, slot);
        // Inside this memory lock, before any subsequent memorize/forget.
        SlotValue initial = slot.current();
        notifyListener(new SlotChange(path, initial.dataType(), null, initial.value(),
                false, initial.cleared(), true, initial.known(), initial.valueIsNull(), false));
        return slot;
    }

    public synchronized Map<String, SlotValue> getUsedSlots() {
        Map<String, SlotValue> snapshot = new LinkedHashMap<>();
        slots.forEach((path, slot) -> snapshot.put(path, slot.current()));
        return snapshot;
    }

    /** Reannounce slots created during Load before the GUI subscribed.
     * Called at Start, before SCXML execution, so event-only clients know
     * the initial values of previously registered slots. */
    public synchronized void announceUsedSlots() {
        slots.forEach((path, slot) -> {
            SlotValue current = slot.current();
            notifyListener(new SlotChange(path, current.dataType(), null, current.value(),
                    false, current.cleared(), true, current.known(), current.valueIsNull(), false));
        });
    }

    public synchronized SlotValue getSlotValue(String path) {
        ObservedSlot<?> slot = slots.get(path);
        return slot == null ? null : slot.current();
    }

    private void notifyListener(SlotChange change) {
        try { listener.accept(change); }
        catch (RuntimeException failure) { LOG.warn("Slot observer failed for " + change.path(), failure); }
    }

    @Override public void configure(IObjectConfigurator config) throws ConfigurationException { delegate.configure(config); }
    @Override public synchronized void cleanUp() throws IOException {
        listener = change -> { };
        slots.clear();
        delegate.cleanUp();
    }

    private final class ObservedSlot<T> implements MemorySlot<T> {
        private final String path;
        private final MemorySlot<T> raw;
        private String last;
        private boolean known;
        private boolean cleared;
        private boolean lastIsNull;
        ObservedSlot(String path, MemorySlot<T> raw) {
            this.path = path;
            this.raw = raw;
            try {
                T existing = raw.recall();
                // Bonsai ObjectSlot returns null for both never-written and
                // explicitly-null values. Without instrumentation at creation
                // time, a null recall is UNKNOWN, not proof of a prior write.
                known = existing != null;
                last = known ? freeze(existing) : null;
                lastIsNull = false;
                cleared = false;
            }
            catch (Exception ignored) { known = false; last = null; }
        }
        synchronized SlotValue current() {
            return new SlotValue(raw.getDataType().getName(), last, known, cleared, lastIsNull);
        }
        @Override public <S extends T> void memorize(S value) throws CommunicationException {
            synchronized (WebSupportMemory.this) {
                synchronized (this) {
                    String before = last;
                    boolean beforeKnown = known;
                    boolean beforeIsNull = lastIsNull;
                    raw.memorize(value);
                    String after = freeze(value);
                    last = after;
                    known = true;
                    cleared = false;
                    lastIsNull = value == null;
                    notifyListener(new SlotChange(path, raw.getDataType().getName(),
                            before, after, beforeKnown, false, false, true, value == null, beforeIsNull));
                }
            }
        }
        @Override public void forget() throws CommunicationException {
            synchronized (WebSupportMemory.this) {
                synchronized (this) {
                    String before = last;
                    boolean beforeKnown = known;
                    boolean beforeIsNull = lastIsNull;
                    raw.forget();
                    last = null;
                    known = true;
                    cleared = true;
                    lastIsNull = true;
                    notifyListener(new SlotChange(path, raw.getDataType().getName(),
                            before, null, beforeKnown, true, false, true, true, beforeIsNull));
                }
            }
        }
        @Override public <S extends T> T recall() throws CommunicationException { return raw.recall(); }
        @Override public <S extends T> Class<S> getDataType() { return raw.getDataType(); }
        @Override public void configure(IObjectConfigurator conf) throws ConfigurationException { raw.configure(conf); }
        @Override public void cleanUp() throws IOException { raw.cleanUp(); }
    }
}
