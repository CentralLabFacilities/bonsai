package de.unibi.citec.clf.bonsai.engine.communication;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/** Typed events emitted by the SCXML runtime. Wire conversion belongs to SCXMLEventSerializer. */
public final class SCXMLEventFactory {
    private SCXMLEventFactory() { }

    /** Sequence zero means that the event has not yet been accepted by SCXMLEventBus. */
    public sealed interface SCXMLEvent permits TransitionOccurred, StateEntered, StateExited,
            Started, Stopped, Completed, StatusChanged, ExternalParameter, ParameterResolved,
            DatamodelAssignment, DatamodelScopeInitialized, SendRequested, ObservationIncomplete {
        Instant timestamp();
        long sequence();
        SCXMLEvent withSequence(long acceptedSequence);
    }

    public enum CompletionOutcome { SUCCESS, FAILURE }

    public record TransitionOccurred(String source, String target, String event,
                                     String declaredEvent, boolean declaredEventKnown,
                                     Instant timestamp, long sequence) implements SCXMLEvent {
        @Override public TransitionOccurred withSequence(long n) {
            return new TransitionOccurred(source, target, event, declaredEvent, declaredEventKnown, timestamp, n);
        }
    }

    public record StateEntered(String state, Instant timestamp, long sequence) implements SCXMLEvent {
        @Override public StateEntered withSequence(long n) { return new StateEntered(state, timestamp, n); }
    }

    public record StateExited(String state, Instant timestamp, long sequence) implements SCXMLEvent {
        @Override public StateExited withSequence(long n) { return new StateExited(state, timestamp, n); }
    }

    public record Started(String initial, Instant timestamp, long sequence) implements SCXMLEvent {
        @Override public Started withSequence(long n) { return new Started(initial, timestamp, n); }
    }

    public record Stopped(Instant timestamp, long sequence) implements SCXMLEvent {
        @Override public Stopped withSequence(long n) { return new Stopped(timestamp, n); }
    }

    public record Completed(String state, CompletionOutcome outcome,
                            Instant timestamp, long sequence) implements SCXMLEvent {
        public Completed { Objects.requireNonNull(outcome, "outcome"); }
        @Override public Completed withSequence(long n) { return new Completed(state, outcome, timestamp, n); }
    }

    public record StatusChanged(StatemachineStatus status, Instant timestamp, long sequence)
            implements SCXMLEvent {
        public StatusChanged { Objects.requireNonNull(status, "status"); }
        @Override public StatusChanged withSequence(long n) { return new StatusChanged(status, timestamp, n); }
    }

    /** An externally supplied parameter has a source marker but no SCXML expression/state. */
    public record ExternalParameter(String name, String value, boolean oldValueKnown,
                                    Instant timestamp, long sequence) implements SCXMLEvent {
        @Override public ExternalParameter withSequence(long n) {
            return new ExternalParameter(name, value, oldValueKnown, timestamp, n);
        }
    }

    public record ParameterResolved(String name, String value, String expression, String state,
                                    boolean oldValueKnown, Instant timestamp, long sequence)
            implements SCXMLEvent {
        @Override public ParameterResolved withSequence(long n) {
            return new ParameterResolved(name, value, expression, state, oldValueKnown, timestamp, n);
        }
    }

    public enum ValueEncoding { JSON, UNSUPPORTED }

    public record DatamodelAssignment(String sourceState, String scope, String location,
                                      String expression, String value, String valueJson,
                                      String valueType, ValueEncoding valueEncoding,
                                      Instant timestamp, long sequence) implements SCXMLEvent {
        public DatamodelAssignment { Objects.requireNonNull(valueEncoding, "valueEncoding"); }
        @Override public DatamodelAssignment withSequence(long n) {
            return new DatamodelAssignment(sourceState, scope, location, expression,
                    value, valueJson, valueType, valueEncoding, timestamp, n);
        }
    }

    public record DatamodelScopeInitialized(String scope, Map<String, String> values,
                                            String valuesJson, Instant timestamp, long sequence)
            implements SCXMLEvent {
        public DatamodelScopeInitialized {
            // Preserve insertion order and freeze captured values before asynchronous publication.
            values = Collections.unmodifiableMap(new LinkedHashMap<>(values));
        }
        @Override public DatamodelScopeInitialized withSequence(long n) {
            return new DatamodelScopeInitialized(scope, values, valuesJson, timestamp, n);
        }
    }

    public record SendRequested(String id, String target, String targetType, String event,
                                String data, long delayMs, Instant timestamp, long sequence)
            implements SCXMLEvent {
        @Override public SendRequested withSequence(long n) {
            return new SendRequested(id, target, targetType, event, data, delayMs, timestamp, n);
        }
    }

    /** Some captured values cannot be observed reliably; nullable fields identify the context. */
    public record ObservationIncomplete(String sourceState, String scope, String location,
                                        String reason, Instant timestamp, long sequence)
            implements SCXMLEvent {
        @Override public ObservationIncomplete withSequence(long n) {
            return new ObservationIncomplete(sourceState, scope, location, reason, timestamp, n);
        }
    }

    public static TransitionOccurred transition(String source, String target, String event) {
        return transition(source, target, event, event);
    }

    public static TransitionOccurred transition(String source, String target, String event, String declaredEvent) {
        return new TransitionOccurred(source, target, event, declaredEvent, true, Instant.now(), 0L);
    }

    public static StateEntered stateEntered(String state) { return new StateEntered(state, Instant.now(), 0L); }
    public static StateExited stateExited(String state) { return new StateExited(state, Instant.now(), 0L); }
    public static Started started(String initial) { return new Started(initial, Instant.now(), 0L); }
    public static Stopped stopped() { return new Stopped(Instant.now(), 0L); }
    public static Completed completed(String state, CompletionOutcome outcome) {
        return new Completed(state, outcome, Instant.now(), 0L);
    }
    public static StatusChanged status(StatemachineStatus status) {
        return new StatusChanged(status, Instant.now(), 0L);
    }
    public static ExternalParameter externalParameter(String name, String value) {
        return new ExternalParameter(name, value, false, Instant.now(), 0L);
    }
    public static ParameterResolved parameterResolved(String name, String value,
                                                       String expression, String state) {
        return new ParameterResolved(name, value, expression, state, false, Instant.now(), 0L);
    }
    public static DatamodelAssignment assignment(String sourceState, String scope, String location,
                                                 String expression, String value, String valueJson,
                                                 String valueType) {
        return new DatamodelAssignment(sourceState, scope, location, expression, value,
                valueJson, valueType, valueJson == null ? ValueEncoding.UNSUPPORTED : ValueEncoding.JSON,
                Instant.now(), 0L);
    }
    public static DatamodelScopeInitialized scopeInitialized(String scope, Map<String, String> values,
                                                             String valuesJson) {
        return new DatamodelScopeInitialized(scope, values, valuesJson, Instant.now(), 0L);
    }
    public static SendRequested sendRequested(String id, String target, String targetType,
                                              String event, String data, long delayMillis) {
        return new SendRequested(id, target, targetType, event, data, delayMillis, Instant.now(), 0L);
    }
    public static ObservationIncomplete observationIncomplete(String sourceState, String scope,
                                                                String location, String reason) {
        return new ObservationIncomplete(sourceState, scope, location, reason, Instant.now(), 0L);
    }
}
