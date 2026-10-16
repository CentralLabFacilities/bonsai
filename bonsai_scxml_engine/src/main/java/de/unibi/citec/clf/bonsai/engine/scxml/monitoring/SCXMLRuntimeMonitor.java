package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEventBus;
import de.unibi.citec.clf.bonsai.engine.events.ScxmlEvents;
import org.apache.commons.scxml2.SCXMLListener;
import org.apache.commons.scxml2.model.EnterableState;
import org.apache.commons.scxml2.model.Final;
import org.apache.commons.scxml2.model.Transition;
import org.apache.commons.scxml2.model.TransitionTarget;

import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;

/**
 * Passively observes SCXML state entry, exit, and transitions, publishing them to
 * {@link BonsaiEventBus}. Delegates variable tracking to {@link DatamodelTracker};
 * never invokes skills, executes actions, or controls the state machine lifecycle.
 */
public final class SCXMLRuntimeMonitor implements SCXMLListener {
    private final ObservableSCXMLExecutor executor;
    private final DatamodelTracker datamodelTracker = new DatamodelTracker();
    private final Predicate<EnterableState> isCustomTerminal;

    public SCXMLRuntimeMonitor(ObservableSCXMLExecutor executor,
                               Predicate<EnterableState> isCustomTerminal) {
        this.executor = Objects.requireNonNull(executor);
        this.isCustomTerminal = Objects.requireNonNull(isCustomTerminal);
    }

    public void refreshGlobalContext() {
        datamodelTracker.trackGlobalContext(executor.getGlobalContext());
    }

    public void resetDatamodelTracking() {
        datamodelTracker.reset();
    }

    /** Publishes a completed explicit SCXML {@code <assign>} action. */
    public void onDatamodelAssignment(String sourceState, String location,
                                      String expression, Object previousValue,
                                      boolean previousValueKnown, boolean previousValuePresent,
                                      Object value) {
        BonsaiEventBus.publish(ScxmlEvents.assignment(
                sourceState, location, expression, DatamodelTracker.formatValue(value),
                previousValuePresent ? DatamodelTracker.formatValue(previousValue) : null,
                previousValueKnown, previousValuePresent));
    }

    /** Compatibility overload for callers that do not capture previous values. */
    public void onDatamodelAssignment(String sourceState, String location,
                                      String expression, Object value) {
        onDatamodelAssignment(sourceState, location, expression, null, false, false, value);
    }

    /** Reports a dispatched or scheduled {@code <send>} request, not delivery. */
    public void onSend(String id, String target, String targetType,
                       String event, Object data, long delayMillis) {
        BonsaiEventBus.publish(ScxmlEvents.sendRequested(
                id, target, targetType, event,
                data == null ? null : DatamodelTracker.formatValue(data), delayMillis));
    }

    public Map<String, Map<String, String>> getDatamodelSnapshot() {
        return datamodelTracker.snapshot();
    }

    @Override
    public void onEntry(EnterableState state) {
        // Local variables may also be introduced by <assign>, without a <datamodel>.
        datamodelTracker.trackContext(state.getId(), executor.getContextFor(state));
        BonsaiEventBus.publish(ScxmlEvents.stateEntered(state.getId()));
        if (state instanceof Final || isCustomTerminal.test(state)) {
            BonsaiEventBus.publish(ScxmlEvents.terminal(state.getId()));
        }
    }

    @Override
    public void onExit(EnterableState state) {
        BonsaiEventBus.publish(ScxmlEvents.stateExited(state.getId()));
    }

    @Override
    public void onTransition(TransitionTarget from, TransitionTarget to,
                             Transition transition, String event) {
        BonsaiEventBus.publish(ScxmlEvents.transition(from.getId(), to.getId(), String.valueOf(event)));
    }
}
