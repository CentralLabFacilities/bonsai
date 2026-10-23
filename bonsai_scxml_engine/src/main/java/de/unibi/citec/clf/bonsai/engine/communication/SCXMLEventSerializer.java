package de.unibi.citec.clf.bonsai.engine.communication;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.*;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Single, wire-compatible JSON encoder used by the runtime WebSocket and JSONL recorder. */
public final class SCXMLEventSerializer {
    private static final ObjectMapper JSON = new ObjectMapper();

    private SCXMLEventSerializer() { }

    /** Serializes the existing type/timestamp/details/sequence/values shape, without a Java type tag. */
    public static String serialize(SCXMLEvent event) throws JsonProcessingException {
        return JSON.writeValueAsString(toWireFields(event));
    }

    /** Dedicated conversion: the Java event hierarchy has no string type() or details() API. */
    public static Map<String, Object> toWireFields(SCXMLEvent event) {
        Map<String, String> details = new LinkedHashMap<>();
        Map<String, String> values = Collections.emptyMap();
        String type;

        if (event instanceof TransitionOccurred e) {
            type = "transition";
            put(details, "source", e.source());
            put(details, "target", e.target());
            put(details, "event", e.event());
            put(details, "declaredEvent", e.declaredEvent());
            put(details, "declaredEventKnown", Boolean.toString(e.declaredEventKnown()));
        } else if (event instanceof StateEntered e) {
            type = "state_entered";
            put(details, "state", e.state());
        } else if (event instanceof StateExited e) {
            type = "state_exited";
            put(details, "state", e.state());
        } else if (event instanceof Started e) {
            type = "started";
            put(details, "initial", e.initial());
        } else if (event instanceof Stopped) {
            type = "stopped";
        } else if (event instanceof Completed e) {
            type = "completed";
            put(details, "state", e.state());
            put(details, "outcome", e.outcome().name().toLowerCase(java.util.Locale.ROOT));
        } else if (event instanceof StatusChanged e) {
            type = "status";
            put(details, "value", e.status().name());
        } else if (event instanceof ExternalParameter e) {
            type = "parameter";
            put(details, "name", e.name());
            put(details, "value", e.value());
            put(details, "newValue", e.value());
            details.put("source", "external");
            details.put("oldValueKnown", Boolean.toString(e.oldValueKnown()));
        } else if (event instanceof ParameterResolved e) {
            type = "parameter";
            put(details, "name", e.name());
            put(details, "value", e.value());
            put(details, "newValue", e.value());
            put(details, "expression", e.expression());
            put(details, "state", e.state());
            details.put("oldValueKnown", Boolean.toString(e.oldValueKnown()));
        } else if (event instanceof DatamodelAssignment e) {
            type = "datamodel_assignment";
            put(details, "sourceState", e.sourceState());
            put(details, "scope", e.scope());
            put(details, "location", e.location());
            put(details, "expression", e.expression());
            put(details, "value", e.value());
            put(details, "newValue", e.value());
            put(details, "newValueJson", e.valueJson());
            put(details, "newValueType", e.valueType());
            details.put("valueEncoding", e.valueEncoding() == ValueEncoding.JSON ? "json" : "unsupported");
        } else if (event instanceof DatamodelScopeInitialized e) {
            type = "datamodel_scope_initialized";
            // Unlike SCXMLEvent.of, the legacy scope constructor did not discard nulls.
            details.put("scope", e.scope());
            details.put("valuesJson", e.valuesJson());
            values = e.values();
        } else if (event instanceof SendRequested e) {
            type = "send_requested";
            put(details, "id", e.id());
            put(details, "target", e.target());
            put(details, "targetType", e.targetType());
            put(details, "event", e.event());
            put(details, "data", e.data());
            details.put("delayMs", Long.toString(e.delayMs()));
        } else if (event instanceof ObservationIncomplete e) {
            type = "observation_incomplete";
            put(details, "sourceState", e.sourceState());
            put(details, "scope", e.scope());
            put(details, "location", e.location());
            put(details, "reason", e.reason());
        } else {
            throw new IllegalArgumentException("Unrecognized SCXML event: " + event.getClass().getName());
        }

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("type", type);
        fields.put("timestamp", event.timestamp().toString());
        fields.put("details", details);
        fields.put("sequence", event.sequence());
        fields.put("values", values);
        return fields;
    }

    private static void put(Map<String, String> details, String key, String value) {
        if (value != null) details.put(key, value);
    }
}
