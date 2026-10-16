package de.unibi.citec.clf.bonsai.monitoring.events;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.jetbrains.annotations.NotNull;


/**
 * Serializes Bonsai event records with the stable envelope
 * {@code {"type": ..., "timestamp": ..., "data": {...}}}.
 *
 * {@link #toJson(BonsaiEvent)} writes a readable single-line JSON object
 * suitable for JSONL recordings. Event-specific fields are discovered
 * automatically from Java records.
 */
public final class BonsaiEventSerializer {
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    // Whitespace is permitted within one JSONL line; actual newlines are not.
    private static final ObjectWriter JSONL_WRITER = MAPPER.writer();

    private BonsaiEventSerializer() { }

    /** Returns a single JSONL-compatible line without a trailing newline. */
    public static String toJson(BonsaiEvent event) {
        try {
            return JSONL_WRITER.writeValueAsString(toEnvelope(event));
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Cannot serialize BonsaiEvent", exception);
        }
    }

    private static ObjectNode toEnvelope(@NotNull BonsaiEvent event) {
        String type = event.type();
        String timestamp = event.timestamp().toString();

        JsonNode fields = MAPPER.valueToTree(event);
        if (!(fields instanceof ObjectNode data)) {
            throw new IllegalArgumentException("BonsaiEvent must serialize to a JSON object: " + event.getClass());
        }
        data.remove("type");
        data.remove("timestamp");

        ObjectNode envelope = MAPPER.createObjectNode();
        envelope.put("type", type);
        envelope.put("timestamp", timestamp);
        envelope.set("data", data);
        return envelope;
    }
}
