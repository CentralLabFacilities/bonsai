package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import de.unibi.citec.clf.bonsai.engine.communication.RuntimeChanges;
import de.unibi.citec.clf.bonsai.engine.communication.RuntimeChanges.RuntimeChange;
import org.apache.commons.scxml2.Context;
import org.apache.commons.scxml2.SCXMLListener;
import org.apache.commons.scxml2.model.EnterableState;
import org.apache.commons.scxml2.model.Transition;
import org.apache.commons.scxml2.model.TransitionTarget;

import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.ConcurrentModificationException;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.HashSet;
import java.util.function.Consumer;

/**
 * Observes one SCXML executor and resolves its runtime variable scopes.
 * No separate context tracker or global event bus is necessary.
 *
 * <p>The owner of an action is not necessarily the declaring scope. For instance,
 * a child state's onentry assignment can modify a variable in the global context.
 * Contexts are tracked by identity; an unresolved scope is never guessed as global.</p>
 *
 * <p>Snapshot callers must synchronize with the state-machine execution lock.
 * {@code SkillStateMachine} does so for its public execution and snapshot APIs.
 * Unsynchronized writes through external Context references cannot be made
 * atomic by this observer.</p>
 */
public final class SCXMLRuntimeMonitor implements SCXMLListener, ObservableAssign.AssignmentObserver {
    private static final String GLOBAL_SCOPE = "global";
    private static final int SNAPSHOT_RETRIES = 3;
    private static final int MAX_JSON_DEPTH = 32;
    private final ObservableSCXMLExecutor executor;
    private final Consumer<RuntimeChange> events;
    private final Object contextsLock = new Object();
    private final Map<String, Context> scopedContexts = new LinkedHashMap<>();
    private final Set<String> announcedScopes = new HashSet<>();

    /** Text remains API-compatible; JSON strings preserve scalar and structured types. */
    public record DatamodelSnapshot(Map<String, Map<String, String>> text,
                                    Map<String, Map<String, String>> json) { }

    /** Immutable representation captured at the time an observation occurs. */
    static final class CapturedValue {
        final String display;
        final String json;
        final String javaType;
        CapturedValue(String display, String json, String javaType) {
            this.display = display;
            this.json = json;
            this.javaType = javaType;
        }
        @Override public String toString() { return display; }
    }

    public SCXMLRuntimeMonitor(ObservableSCXMLExecutor executor,
                               Consumer<RuntimeChange> events) {
        this.executor = Objects.requireNonNull(executor);
        this.events = Objects.requireNonNull(events);
    }

    public void resetDatamodelTracking() {
        synchronized (contextsLock) { scopedContexts.clear(); announcedScopes.clear(); }
    }

    public void refreshGlobalContext() {
        registerContext(GLOBAL_SCOPE, executor.getGlobalContext());
    }

    private void registerContext(String scope, Context context) {
        if (scope == null || context == null) return;
        synchronized (contextsLock) {
            for (Map.Entry<String, Context> existing : scopedContexts.entrySet()) {
                if (existing.getValue() == context && !existing.getKey().equals(scope)) {
                    return; // Commons SCXML's single-context mode: preserve original owner.
                }
            }
            scopedContexts.put(scope, context);
        }
    }

    /** Registers the source state AND enclosing states (ancestor-first). */
    private void registerAncestors(String sourceState) {
        if (sourceState == null || executor.getStateMachine() == null) return;
        TransitionTarget target = executor.getStateMachine().getTargets().get(sourceState);
        if (!(target instanceof EnterableState state)) return;
        List<EnterableState> ancestry = new ArrayList<>();
        for (EnterableState current = state; current != null; current = current.getParent()) {
            ancestry.add(0, current);
        }
        for (EnterableState member : ancestry) {
            registerContext(member.getId(), executor.getContextFor(member));
        }
    }

    /**
     * Captures initial local variables before the first assignment in an onentry.
     * Apache's SCXMLListener.onEntry runs after those actions, so it is too late
     * as the only source of datamodel initialization notifications.
     */
    @Override
    public void beforeAssignment(String sourceState, Context context) {
        refreshGlobalContext();
        registerAncestors(sourceState);
        publishUnannouncedScopes();
    }

    private void publishUnannouncedScopes() {
        List<RuntimeChange> initializations = new ArrayList<>();
        synchronized (contextsLock) {
            for (Map.Entry<String, Context> scope : scopedContexts.entrySet()) {
                if (announcedScopes.contains(scope.getKey())) continue;
                // Store text/typed values as one immutable JSON string in the
                // existing RuntimeChange details map, without another event API.
                Map<String, Object> values;
                try {
                    values = copyContext(scope.getValue());
                } catch (RuntimeException failure) {
                    initializations.add(RuntimeChange.of("observation_incomplete",
                            "scope", scope.getKey(), "reason", "Could not capture initialized SCXML scope"));
                    continue;
                }
                StringBuilder encoded = new StringBuilder("{");
                boolean first = true;
                for (Map.Entry<String, Object> variable : values.entrySet()) {
                    if (!first) encoded.append(',');
                    first = false;
                    CapturedValue snapshot = captureValue(variable.getValue());
                    encoded.append(quote(variable.getKey())).append(':').append(
                            snapshot.json == null
                                    ? "{\"$bonsaiUnsupportedType\":" + quote(snapshot.javaType) + "}"
                                    : snapshot.json);
                }
                encoded.append('}');
                announcedScopes.add(scope.getKey());
                initializations.add(RuntimeChange.of("datamodel_scope_initialized",
                        "scope", scope.getKey(), "valuesJson", encoded.toString()));
            }
        }
        // External listeners may call back into the monitor; don't notify
        // them while holding its registry lock.
        for (RuntimeChange initialization : initializations) events.accept(initialization);
    }

    /** A missing registration is unknown, NOT global. */
    private String scopeFor(Context declaringContext, String sourceState) {
        if (declaringContext == null) return null;
        refreshGlobalContext();
        if (declaringContext == executor.getGlobalContext()) return GLOBAL_SCOPE;
        registerAncestors(sourceState);
        synchronized (contextsLock) {
            for (Map.Entry<String, Context> entry : scopedContexts.entrySet()) {
                if (entry.getValue() == declaringContext) return entry.getKey();
            }
        }
        return null;
    }

    @Override
    public void onAssignment(String sourceState, Context declaringContext, String location,
                             String expression, Object previousValue,
                             boolean previousValueKnown, boolean previousValuePresent,
                             Object value) {
        onDatamodelAssignment(sourceState, declaringContext, location, expression,
                previousValue, previousValueKnown, previousValuePresent, value);
    }

    /** Notification after execution of an explicit SCXML {@code <assign>}. */
    public void onDatamodelAssignment(String sourceState, Context declaringContext, String location,
                                      String expression, Object previousValue,
                                      boolean previousValueKnown, boolean previousValuePresent,
                                      Object value) {
        String scope = scopeFor(declaringContext, sourceState);
        if (scope == null) {
            events.accept(RuntimeChange.of("observation_incomplete", "sourceState", sourceState,
                    "location", location, "reason", declaringContext == null
                            ? "Unsupported or unresolved assignment location"
                            : "Unable to resolve declaring SCXML context"));
            return;
        }
        CapturedValue before = previousValue instanceof CapturedValue captured
                ? captured : captureValue(previousValue);
        CapturedValue after = captureValue(value);
        events.accept(RuntimeChanges.assignment(
                sourceState, scope, location, expression, after.display,
                previousValuePresent ? before.display : null,
                previousValueKnown, previousValuePresent,
                after.json, previousValuePresent ? before.json : null,
                after.javaType, previousValuePresent ? before.javaType : null));
        if (after.json == null || (previousValuePresent && before.json == null)) {
            events.accept(RuntimeChange.of("observation_incomplete", "sourceState", sourceState,
                    "location", location, "reason", "Assignment value is not JSON-representable"));
        }
    }

    /** Compatibility overload when the caller has not captured a context. */
    public void onDatamodelAssignment(String sourceState, String location, String expression, Object value) {
        onDatamodelAssignment(sourceState, null, location, expression, null, false, false, value);
    }

    public void onSend(String id, String target, String targetType,
                       String event, Object data, long delayMillis) {
        events.accept(RuntimeChanges.sendRequested(id, target, targetType, event,
                data == null ? null : captureValue(data).display, delayMillis));
    }

    /** Reads all scopes; never silently skips a scope after a concurrent modification. */
    public DatamodelSnapshot captureDatamodelSnapshot() {
        synchronized (contextsLock) {
            Map<String, Map<String, String>> text = new LinkedHashMap<>();
            Map<String, Map<String, String>> json = new LinkedHashMap<>();
            for (Map.Entry<String, Context> scope : scopedContexts.entrySet()) {
                Map<String, Object> variables = copyContext(scope.getValue());
                Map<String, String> rendered = new LinkedHashMap<>();
                Map<String, String> encoded = new LinkedHashMap<>();
                for (Map.Entry<String, Object> variable : variables.entrySet()) {
                    CapturedValue captured = captureValue(variable.getValue());
                    rendered.put(variable.getKey(), captured.display);
                    // Null means unsupported serialization, not a Java null value.
                    // Clients receive an explicit marker instead of a guessed value.
                    encoded.put(variable.getKey(), captured.json == null
                            ? "{\"$bonsaiUnsupportedType\":" + quote(captured.javaType) + "}"
                            : captured.json);
                }
                if (!rendered.isEmpty() || GLOBAL_SCOPE.equals(scope.getKey())) {
                    text.put(scope.getKey(), Map.copyOf(rendered));
                    json.put(scope.getKey(), Map.copyOf(encoded));
                }
            }
            return new DatamodelSnapshot(Map.copyOf(text), Map.copyOf(json));
        }
    }

    private static Map<String, Object> copyContext(Context context) {
        for (int attempt = 0; attempt < SNAPSHOT_RETRIES; attempt++) {
            try {
                return new LinkedHashMap<>(context.getVars());
            } catch (ConcurrentModificationException ex) {
                if (attempt == SNAPSHOT_RETRIES - 1) {
                    throw new IllegalStateException("SCXML context changed during snapshot", ex);
                }
                Thread.yield();
            }
        }
        throw new IllegalStateException("SCXML context snapshot failed");
    }

    public Map<String, Map<String, String>> getDatamodelSnapshot() {
        return captureDatamodelSnapshot().text();
    }

    /** Capture before publishing, so a later mutation cannot rewrite the history. */
    static CapturedValue captureValue(Object value) {
        String display;
        try { display = String.valueOf(value); }
        catch (RuntimeException ex) { display = "<unprintable>"; }
        String type = value == null ? "null" : value.getClass().getName();
        StringBuilder json = new StringBuilder();
        boolean supported;
        try { supported = appendJson(value, json, new IdentityHashMap<>(), 0); }
        catch (RuntimeException ex) { supported = false; }
        return new CapturedValue(display, supported ? json.toString() : null, type);
    }

    private static boolean appendJson(Object value, StringBuilder out,
                                      IdentityHashMap<Object, Boolean> seen, int depth) {
        if (value == null) { out.append("null"); return true; }
        if (value instanceof String || value instanceof Character || value instanceof Enum<?>) {
            out.append(quote(value.toString())); return true;
        }
        if (value instanceof Boolean) { out.append(value); return true; }
        if (value instanceof Number number) {
            String numberText = number.toString();
            // JavaScript numbers cannot represent all Java integral/decimal values.
            // Preserve their exact digits and Java type instead of rounding them.
            if (number instanceof java.math.BigInteger || number instanceof java.math.BigDecimal ||
                    number instanceof Long && (number.longValue() > 9007199254740991L ||
                    number.longValue() < -9007199254740991L)) {
                out.append("{\"$bonsaiExactNumber\":{")
                        .append("\"javaType\":").append(quote(number.getClass().getName()))
                        .append(",\"value\":").append(quote(numberText)).append("}}");
                return true;
            }
            if (number instanceof Double d && !Double.isFinite(d) ||
                number instanceof Float f && !Float.isFinite(f)) return false;
            if (!numberText.matches("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?")) return false;
            out.append(numberText); return true;
        }
        if (depth >= MAX_JSON_DEPTH || seen.put(value, Boolean.TRUE) != null) return false;
        try {
            if (value instanceof Map<?, ?> map) {
                out.append('{'); boolean first = true;
                for (Map.Entry<?, ?> e : map.entrySet()) {
                    if (!(e.getKey() instanceof String)) return false;
                    if (!first) out.append(','); first = false;
                    out.append(quote((String) e.getKey())).append(':');
                    if (!appendJson(e.getValue(), out, seen, depth + 1)) return false;
                }
                out.append('}'); return true;
            }
            if (value instanceof Iterable<?> values) {
                out.append('['); boolean first = true;
                for (Object element : values) {
                    if (!first) out.append(','); first = false;
                    if (!appendJson(element, out, seen, depth + 1)) return false;
                }
                out.append(']'); return true;
            }
            if (value.getClass().isArray()) {
                out.append('[');
                for (int i = 0; i < Array.getLength(value); i++) {
                    if (i != 0) out.append(',');
                    if (!appendJson(Array.get(value, i), out, seen, depth + 1)) return false;
                }
                out.append(']'); return true;
            }
            return false;
        } catch (ConcurrentModificationException ex) {
            return false;
        } finally {
            seen.remove(value);
        }
    }

    private static String quote(String input) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        return out.append('"').toString();
    }

    @Override public void onEntry(EnterableState state) {
        refreshGlobalContext();
        registerAncestors(state.getId());
        publishUnannouncedScopes();
        events.accept(RuntimeChanges.stateEntered(state.getId()));
    }

    @Override public void onExit(EnterableState state) {
        events.accept(RuntimeChanges.stateExited(state.getId()));
        // A re-entered state gets a new scope baseline even if Apache reuses its Context.
        synchronized (contextsLock) { announcedScopes.remove(state.getId()); }
    }

    @Override public void onTransition(TransitionTarget from, TransitionTarget to,
                                       Transition transition, String event) {
        events.accept(RuntimeChanges.transition(from == null ? "" : from.getId(),
                to == null ? "" : to.getId(), String.valueOf(event)));
    }
}
