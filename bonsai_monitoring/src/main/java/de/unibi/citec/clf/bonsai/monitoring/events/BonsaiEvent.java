package de.unibi.citec.clf.bonsai.monitoring.events;

import java.time.Instant;

/**
 * Immutable notification of something that happened in Bonsai.
 *
 * <p>Each event supplies a stable wire type and a timestamp. Event records can
 * add their own fields; {@link BonsaiEventSerializer} serializes them without
 * knowing their concrete classes. Current values belong to snapshots instead.</p>
 */
public interface BonsaiEvent {
    /** When the event occurred. */
    Instant timestamp();

    /** Stable identifier used in recordings (independent of the Java class name). */
    String type();
}
