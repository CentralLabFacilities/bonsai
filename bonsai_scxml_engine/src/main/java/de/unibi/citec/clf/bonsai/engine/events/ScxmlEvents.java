package de.unibi.citec.clf.bonsai.engine.events;

import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEvent;
import java.time.Instant;

/**
 * Typed notifications originating from the SCXML engine.
 * Snapshots are separate from these events and are generated on demand.
 */
public final class ScxmlEvents {
    private ScxmlEvents() { }

    /** The executor took a transition. */
    public record Transition(Instant timestamp, String source, String target, String event)
            implements BonsaiEvent {
        @Override public String type() { return "transition"; }
    }

    /** The executor entered an SCXML state. */
    public record StateEntered(Instant timestamp, String state) implements BonsaiEvent {
        @Override public String type() { return "state_entered"; }
    }

    /** The executor exited an SCXML state. */
    public record StateExited(Instant timestamp, String state) implements BonsaiEvent {
        @Override public String type() { return "state_exited"; }
    }

    /** The executor entered a terminal or configured End/Fatal state. */
    public record TerminalState(Instant timestamp, String state) implements BonsaiEvent {
        @Override public String type() { return "terminal"; }
    }

    /** A successful explicit SCXML <assign> action; value is the stored variable value. */
    public record Assignment(Instant timestamp, String sourceState, String location,
                             String expression, String value, String oldValue,
                             boolean oldValueKnown, boolean oldValuePresent) implements BonsaiEvent {
        public Assignment(Instant timestamp, String sourceState, String location,
                          String expression, String value) {
            this(timestamp, sourceState, location, expression, value, null, false, false);
        }
        @Override public String type() { return "datamodel_assignment"; }
    }

    /** An SCXML send request was passed to the event dispatcher (possibly delayed). */
    public record SendRequested(Instant timestamp, String id,
                                String target, String targetType, String event,
                                String data, long delayMillis) implements BonsaiEvent {
        @Override public String type() { return "send_requested"; }
    }

    /** A parameter was resolved for a skill or provided externally. */
    public record ParameterResolved(Instant timestamp, String name, String value,
                                    String expression, String state, String source)
            implements BonsaiEvent {
        @Override public String type() { return "parameter"; }
    }

    /** A state-machine lifecycle status was reported. */
    public record Status(Instant timestamp, String value) implements BonsaiEvent {
        @Override public String type() { return "status"; }
    }

    /** The state machine was stopped. */
    public record Stopped(Instant timestamp) implements BonsaiEvent {
        @Override public String type() { return "stopped"; }
    }

    public static Transition transition(String source, String target, String event) {
        return new Transition(Instant.now(), source, target, event);
    }

    public static StateEntered stateEntered(String state) {
        return new StateEntered(Instant.now(), state);
    }

    public static StateExited stateExited(String state) {
        return new StateExited(Instant.now(), state);
    }

    public static TerminalState terminal(String state) {
        return new TerminalState(Instant.now(), state);
    }

    public static Assignment assignment(String sourceState, String location,
                                        String expression, String value) {
        return assignment(sourceState, location, expression, value, null, false, false);
    }

    public static Assignment assignment(String sourceState, String location,
                                        String expression, String value, String oldValue,
                                        boolean oldValueKnown, boolean oldValuePresent) {
        return new Assignment(Instant.now(), sourceState, location, expression, value,
                oldValue, oldValueKnown, oldValuePresent);
    }

    public static SendRequested sendRequested(String id, String target,
                                              String targetType, String event, String data,
                                              long delayMillis) {
        return new SendRequested(Instant.now(), id, target, targetType,
                event, data, delayMillis);
    }

    public static ParameterResolved parameterResolved(String name, String value,
                                                      String expression, String state) {
        return new ParameterResolved(Instant.now(), name, value, expression, state, null);
    }

    public static ParameterResolved externalParameter(String name, String value) {
        return new ParameterResolved(Instant.now(), name, value, null, null, "external");
    }

    public static Status status(String value) {
        return new Status(Instant.now(), value);
    }

    public static Stopped stopped() {
        return new Stopped(Instant.now());
    }
}
