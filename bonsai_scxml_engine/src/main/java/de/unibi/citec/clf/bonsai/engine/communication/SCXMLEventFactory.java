package de.unibi.citec.clf.bonsai.engine.communication;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Collections;
import java.util.Map;
import java.util.Objects;

/** Small factories for the wire-compatible runtime notifications. No event subclasses. */
public final class SCXMLEventFactory {
    private SCXMLEventFactory() { }
    /** Compatibility factory: supplied event name is also the declared expression. */
    public static SCXMLEvent transition(String source, String target, String event) {
        return transition(source, target, event, event);
    }

    /** Preserve both the actual trigger and the transition's declared event expression. */
    public static SCXMLEvent transition(String source, String target,
                                        String event, String declaredEvent) {
        return SCXMLEvent.of("transition", "source", source, "target", target,
                "event", event, "declaredEvent", declaredEvent,
                "declaredEventKnown", "true");
    }
    public static SCXMLEvent stateEntered(String state) { return SCXMLEvent.of("state_entered", "state", state); }
    public static SCXMLEvent stateExited(String state) { return SCXMLEvent.of("state_exited", "state", state); }
    public static SCXMLEvent started(String initial) { return SCXMLEvent.of("started", "initial", initial); }
    public static SCXMLEvent stopped() { return SCXMLEvent.of("stopped"); }
    /** Natural completion of the entire state machine, not an intermediate nested final state. */
    public static SCXMLEvent completed(String state, String outcome) {
        return SCXMLEvent.of("completed", "state", state, "outcome", outcome);
    }
    public static SCXMLEvent status(String value) { return SCXMLEvent.of("status", "value", value); }
    public static SCXMLEvent externalParameter(String name, String value) {
        return SCXMLEvent.of("parameter", "name", name, "value", value, "newValue", value,
                "source", "external", "oldValueKnown", "false");
    }
    public static SCXMLEvent parameterResolved(String name, String value, String expression, String state) {
        return SCXMLEvent.of("parameter", "name", name, "value", value, "newValue", value,
                "expression", expression, "state", state, "oldValueKnown", "false");
    }
    /** A completed assignment reports its resulting value; prior values belong to the event history. */
    public static SCXMLEvent assignment(String sourceState, String scope, String location,
                                        String expression, String value, String valueJson,
                                        String valueType) {
        return SCXMLEvent.of("datamodel_assignment", "sourceState", sourceState, "scope", scope,
                "location", location, "expression", expression, "value", value,
                "newValue", value, "newValueJson", valueJson,
                "newValueType", valueType,
                "valueEncoding", valueJson == null ? "unsupported" : "json");
    }

    /** Initial values of a datamodel scope, accessible both directly and as JSON. */
    public static SCXMLEvent scopeInitialized(String scope, Map<String, String> values,
                                              String valuesJson) {
        return new SCXMLEvent("datamodel_scope_initialized", Instant.now(),
                Map.of("scope", scope, "valuesJson", valuesJson), 0L, values);
    }

    public static SCXMLEvent sendRequested(String id, String target, String targetType,
                                           String event, String data, long delayMillis) {
        return SCXMLEvent.of("send_requested", "id", id, "target", target,
                "targetType", targetType, "event", event, "data", data,
                "delayMs", Long.toString(delayMillis));
    }

    /** One immutable execution change. Sequence 0 means not yet accepted by the publisher. */
    public record SCXMLEvent(String type, Instant timestamp, Map<String, String> details,
                             long sequence, Map<String, String> values) {
        public SCXMLEvent {
            Objects.requireNonNull(type);
            Objects.requireNonNull(timestamp);
            details = Map.copyOf(details);
            // Freeze the captured scope values before passing events to the async worker.
            values = Collections.unmodifiableMap(new LinkedHashMap<>(values));
        }

        /** Keeps callers using the original four-field record constructor compatible. */
        public SCXMLEvent(String type, Instant timestamp, Map<String, String> details, long sequence) {
            this(type, timestamp, details, sequence, Map.of());
        }

        /** Keeps existing callers constructing the original three-field record compatible. */
        public SCXMLEvent(String type, Instant timestamp, Map<String, String> details) {
            this(type, timestamp, details, 0L, Map.of());
        }

        public SCXMLEvent withSequence(long acceptedSequence) {
            return new SCXMLEvent(type, timestamp, details, acceptedSequence, values);
        }

        public static SCXMLEvent of(String type, String... fields) {
            if (fields.length % 2 != 0) {
                throw new IllegalArgumentException("key/value pairs required");
            }
            Map<String, String> values = new LinkedHashMap<>();
            for (int i = 0; i < fields.length; i += 2) {
                if (fields[i + 1] != null) {
                    values.put(fields[i], fields[i + 1]);
                }
            }
            return new SCXMLEvent(type, Instant.now(), values);
        }
    }
}
