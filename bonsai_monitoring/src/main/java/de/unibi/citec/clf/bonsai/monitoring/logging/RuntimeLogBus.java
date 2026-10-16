package de.unibi.citec.clf.bonsai.monitoring.logging;

import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

public final class RuntimeLogBus {

    private static final CopyOnWriteArrayList<Consumer<RuntimeLog>> LISTENERS =
            new CopyOnWriteArrayList<>();

    private RuntimeLogBus() {}

    public static void subscribe(Consumer<RuntimeLog> listener) {
        LISTENERS.addIfAbsent(Objects.requireNonNull(listener));
    }

    public static void unsubscribe(Consumer<RuntimeLog> listener) {
        LISTENERS.remove(listener);
    }

    public static void publish(RuntimeLog log) {
        for (Consumer<RuntimeLog> listener : LISTENERS) {
            try {
                listener.accept(log);
            } catch (Exception ignored) {
                // Avoid recursive logging.
            }
        }
    }
}