package de.unibi.citec.clf.bonsai.monitoring.events;

import org.apache.log4j.Logger;
import org.jetbrains.annotations.NotNull;

import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * Process-wide publisher for typed {@link BonsaiEvent}s.
 */
public final class BonsaiEventBus {
    private static final Logger LOG = Logger.getLogger(BonsaiEventBus.class);
    private static final CopyOnWriteArrayList<Consumer<BonsaiEvent>> LISTENERS = new CopyOnWriteArrayList<>();

    private BonsaiEventBus() { }

    public static void subscribe(@NotNull Consumer<BonsaiEvent> listener) {
        LISTENERS.addIfAbsent(listener);
    }

    public static void unsubscribe(Consumer<BonsaiEvent> listener) {
        LISTENERS.remove(listener);
    }

    public static void publish(@NotNull BonsaiEvent event) {
        for (Consumer<BonsaiEvent> listener : LISTENERS) {
            try {
                listener.accept(event);
            } catch (Exception e) {
                LOG.warn("Bonsai event listener failed", e);
            }
        }
    }
}
