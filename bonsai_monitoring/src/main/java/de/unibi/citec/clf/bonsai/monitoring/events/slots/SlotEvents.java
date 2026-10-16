package de.unibi.citec.clf.bonsai.monitoring.events.slots;

import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEvent;
import java.time.Instant;

/** Working-memory changes, with the previous value when it could be observed. */
public final class SlotEvents {
    private SlotEvents() { }

    /** oldValueKnown=false means the previous value could not be read reliably. */
    public record Written(Instant timestamp,
                          String slot,
                          String dataType,
                          String value,
                          String oldValue) implements BonsaiEvent {
        public Written(Instant timestamp, String slot, String dataType, String value) {
            this(timestamp, slot, dataType, value, null);
        }

        @Override public String type() { return "slot_written"; }
    }

    public record Cleared(Instant timestamp,
                          String slot,
                          String dataType,
                          String oldValue) implements BonsaiEvent {
        public Cleared(Instant timestamp, String slot, String dataType) {
            this(timestamp, slot, dataType, null);
        }
        @Override public String type() { return "slot_cleared"; }
    }

    public static Written written(String slot, String dataType, String value) {
        return written(slot, dataType, value, null);
    }

    public static Written written(String slot, String dataType, String value,
                                  String oldValue) {
        return new Written(Instant.now(), slot, dataType, value, oldValue);
    }

    public static Cleared cleared(String slot, String dataType) {
        return cleared(slot, dataType, null);
    }

    public static Cleared cleared(String slot, String dataType,
                                  String oldValue) {
        return new Cleared(Instant.now(), slot, dataType, oldValue);
    }
}
