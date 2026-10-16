package de.unibi.citec.clf.bonsai.monitoring.events;

import de.unibi.citec.clf.bonsai.monitoring.events.slots.SlotEvents;
import org.junit.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/** Verifies JSON escaping and serialization using only the Java standard library. */
public class BonsaiEventSerializerTest {
    @Test
    public void serializesSlotEventsWithoutClassSpecificMapping() {
        SlotEvents.Written event = new SlotEvents.Written(
                Instant.parse("2026-10-11T12:00:00Z"), "/pick/model", "String", "cup \"A\"\nB", null);
        assertEquals(
                "{\"type\":\"slot_written\",\"timestamp\":\"2026-10-11T12:00:00Z\","
                + "\"data\":{\"slot\":\"/pick/model\",\"dataType\":\"String\","
                + "\"value\":\"cup \\\"A\\\"\\nB\",\"oldValue\":null}}",
                BonsaiEventSerializer.toJson(event));
    }

    public record FutureEvent(Instant timestamp, String note, int count, boolean active)
            implements BonsaiEvent {
        @Override public String type() { return "future_event_v1"; }
    }

    @Test
    public void serializesNewRecordTypesAndNullFields() {
        FutureEvent event = new FutureEvent(Instant.parse("2026-10-11T12:00:00Z"), null, 4, true);
        assertEquals(
                "{\"type\":\"future_event_v1\",\"timestamp\":\"2026-10-11T12:00:00Z\","
                + "\"data\":{\"note\":null,\"count\":4,\"active\":true}}",
                BonsaiEventSerializer.toJson(event));
    }

    public record NestedEvent(Instant timestamp, Map<String, List<Integer>> values) implements BonsaiEvent {
        @Override public String type() { return "nested"; }
    }

    @Test
    public void serializesNestedCollections() {
        NestedEvent event = new NestedEvent(Instant.EPOCH, Map.of("nums", List.of(1, 2)));
        assertEquals("{\"type\":\"nested\",\"timestamp\":\"1970-01-01T00:00:00Z\","
                + "\"data\":{\"values\":{\"nums\":[1,2]}}}", BonsaiEventSerializer.toJson(event));
    }

    @Test
    public void serializesBackslashesControlsAndUnicode() {
        SlotEvents.Written event = new SlotEvents.Written(
                Instant.EPOCH, "x", "String", "\\\r\t\u0001☕", null);
        assertTrue(BonsaiEventSerializer.toJson(event).contains("\"value\":\"\\\\\\r\\t\\u0001☕\""));
    }
}
