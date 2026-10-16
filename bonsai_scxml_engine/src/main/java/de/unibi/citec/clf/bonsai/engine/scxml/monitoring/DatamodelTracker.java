package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import org.apache.commons.scxml2.Context;

import java.util.ConcurrentModificationException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tracks the data-model contexts of one SCXML executor and provides snapshots
 * of their current variable values. Does not publish runtime events.
 */
public final class DatamodelTracker {
    private static final String GLOBAL_SCOPE = "global";
    private static final int MAX_VALUE_LENGTH = 4096;

    private final Object lock = new Object();
    private final Map<String, Context> scopedContexts = new LinkedHashMap<>();

    public void reset() {
        synchronized (lock) {
            scopedContexts.clear();
        }
    }

    public void trackGlobalContext(Context context) {
        trackContext(GLOBAL_SCOPE, context);
    }

    public void trackContext(String scope, Context context) {
        if (context == null) return;
        synchronized (lock) {
            // In single-context mode, multiple state scopes may share the same context.
            for (Map.Entry<String, Context> registered : scopedContexts.entrySet()) {
                if (registered.getValue() == context && !registered.getKey().equals(scope)) return;
            }
            scopedContexts.put(scope, context);
        }
    }

    /** Current context variables, grouped by scope. */
    public Map<String, Map<String, String>> snapshot() {
        Map<String, Map<String, String>> snapshot = new LinkedHashMap<>();
        synchronized (lock) {
            for (Map.Entry<String, Context> scope : scopedContexts.entrySet()) {
                Map<String, String> values = new LinkedHashMap<>();
                try {
                    scope.getValue().getVars().forEach((name, value) ->
                            values.put(name, formatValue(value)));
                } catch (ConcurrentModificationException e) {
                    // State execution may update a context concurrently with a snapshot.
                    continue;
                }
                if (!values.isEmpty() || GLOBAL_SCOPE.equals(scope.getKey())) {
                    snapshot.put(scope.getKey(), values);
                }
            }
        }
        return snapshot;
    }

    /** String representation shared by snapshots and assignment notifications. */
    static String formatValue(Object value) {
        String text;
        try {
            text = String.valueOf(value);
        } catch (RuntimeException e) {
            text = "<unprintable>";
        }
        return text.length() > MAX_VALUE_LENGTH
                ? text.substring(0, MAX_VALUE_LENGTH) + "…" : text;
    }
}
