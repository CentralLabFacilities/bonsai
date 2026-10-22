package de.unibi.citec.clf.bonsai.engine.communication;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/** Small factories for the wire-compatible runtime notifications. No event subclasses. */
public final class RuntimeChanges {
    private RuntimeChanges() { }
    public static RuntimeChange transition(String source, String target, String event) {
        return RuntimeChange.of("transition", "source", source, "target", target, "event", event);
    }
    public static RuntimeChange stateEntered(String state) { return RuntimeChange.of("state_entered", "state", state); }
    public static RuntimeChange stateExited(String state) { return RuntimeChange.of("state_exited", "state", state); }
    public static RuntimeChange stopped() { return RuntimeChange.of("stopped"); }
    public static RuntimeChange status(String value) { return RuntimeChange.of("status", "value", value); }
    public static RuntimeChange externalParameter(String name, String value) {
        return RuntimeChange.of("parameter", "name", name, "value", value, "newValue", value,
                "source", "external", "oldValueKnown", "false");
    }
    public static RuntimeChange parameterResolved(String name, String value, String expression, String state) {
        return RuntimeChange.of("parameter", "name", name, "value", value, "newValue", value,
                "expression", expression, "state", state, "oldValueKnown", "false");
    }
    public static RuntimeChange assignment(String sourceState, String scope, String location,
                                           String expression, String value, String oldValue,
                                           boolean oldKnown, boolean oldPresent) {
        return RuntimeChange.of("datamodel_assignment", "sourceState", sourceState, "scope", scope,
                "location", location, "expression", expression, "value", value, "newValue", value,
                "oldValue", oldValue, "oldValueKnown", Boolean.toString(oldKnown),
                "oldValuePresent", Boolean.toString(oldPresent));
    }
    /** Extended, type-preserving representation alongside legacy display fields. */
    public static RuntimeChange assignment(String sourceState, String scope, String location,
                                           String expression, String value, String oldValue,
                                           boolean oldKnown, boolean oldPresent,
                                           String valueJson, String oldValueJson,
                                           String valueType, String oldValueType) {
        return RuntimeChange.of("datamodel_assignment", "sourceState", sourceState, "scope", scope,
                "location", location, "expression", expression, "value", value,
                "newValue", value, "oldValue", oldValue,
                "oldValueKnown", Boolean.toString(oldKnown),
                "oldValuePresent", Boolean.toString(oldPresent),
                "newValueJson", valueJson, "oldValueJson", oldValueJson,
                "newValueType", valueType, "oldValueType", oldValueType,
                "valueEncoding", valueJson == null ? "unsupported" : "json");
    }

    public static RuntimeChange sendRequested(String id, String target, String targetType,
                                              String event, String data, long delayMillis) {
        return RuntimeChange.of("send_requested", "id", id, "target", target,
                "targetType", targetType, "event", event, "data", data,
                "delayMs", Long.toString(delayMillis));
    }

    /** One immutable execution change, delivered to listeners of this state machine. */
    public record RuntimeChange(String type, Instant timestamp, Map<String, String> details) {
        public RuntimeChange {
            Objects.requireNonNull(type);
            Objects.requireNonNull(timestamp);
            details = Map.copyOf(details);
        }

        public static RuntimeChange of(String type, String... fields) {
            if (fields.length % 2 != 0) {
                throw new IllegalArgumentException("key/value pairs required");
            }
            Map<String, String> values = new LinkedHashMap<>();
            for (int i = 0; i < fields.length; i += 2) {
                if (fields[i + 1] != null) {
                    values.put(fields[i], fields[i + 1]);
                }
            }
            return new RuntimeChange(type, Instant.now(), values);
        }
    }
}
