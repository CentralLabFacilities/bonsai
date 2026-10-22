package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import org.apache.commons.scxml2.ActionExecutionContext;
import org.apache.commons.scxml2.Context;
import org.apache.commons.scxml2.SCXMLExpressionException;
import org.apache.commons.scxml2.model.Action;
import org.apache.commons.scxml2.model.Assign;
import org.apache.commons.scxml2.model.EnterableState;
import org.apache.commons.scxml2.model.ModelException;

import java.util.Objects;

/**
 * Observes successful SCXML {@code <assign>} actions by delegating to the
 * original Apache Commons SCXML {@link Assign} action.
 *
 * <p>After the original action completes, the assigned value is read from its
 * state context and delivered to an {@link AssignmentObserver}. This avoids
 * evaluating the expression a second time. Bonsai uses simple variable names
 * for assignment locations; complex location expressions are not interpreted
 * by this wrapper. Observation failures do not interrupt execution.</p>
 */
public final class ObservableAssign extends Action {
    /** Receives information about a successfully completed assignment. */
    @FunctionalInterface
    public interface AssignmentObserver {
        /**
         * Handles an assignment observed after successful execution.
         *
         * @param sourceState ID of the state that owns the assignment
         * @param location assignment target (a simple variable name in Bonsai)
         * @param expression original right-hand-side expression
         * @param value current value read from the SCXML context, or
         *              {@code "<value unavailable>"} when it cannot be read
         */
        void onAssignment(String sourceState, String location, String expression, Object value);
    }

    private final Assign original;
    private AssignmentObserver observer;

    private ObservableAssign(Assign original, AssignmentObserver observer) {
        this.original = Objects.requireNonNull(original, "original");
        setObserver(observer);
        // Preserve the original action's parent and let Apache execute it unmodified.
        setParent(original.getParent());
    }

    /**
     * Wraps a parsed assignment without modifying the original action.
     *
     * @param original Apache Commons SCXML assignment to execute
     * @param observer callback for successfully completed assignments
     * @return an observable wrapper around {@code original}
     * @throws NullPointerException if either argument is null
     */
    public static ObservableAssign from(Assign original, AssignmentObserver observer) {
        return new ObservableAssign(original, observer);
    }

    /**
     * Replaces the callback when an instrumented model is reused by another
     * runtime monitor, without nesting additional wrappers.
     *
     * @param observer new assignment callback
     * @throws NullPointerException if {@code observer} is null
     */
    void setObserver(AssignmentObserver observer) {
        this.observer = Objects.requireNonNull(observer, "observer");
    }

    /**
     * Executes the original action exactly once and, on success, reports its
     * stored value for a simple variable location.
     *
     * <p>Exceptions thrown by the original action retain their usual behavior;
     * only failures in the subsequent monitoring code are ignored.</p>
     *
     * @param context Apache Commons SCXML action execution context
     * @throws ModelException if the original action fails with a model error
     * @throws SCXMLExpressionException if the original expression cannot be evaluated
     */
    @Override
    public void execute(ActionExecutionContext context)
            throws ModelException, SCXMLExpressionException {
        // The original action is always executed exactly once, with its normal
        // semantics and exception handling. A failed assignment emits no event.
        original.execute(context);

        try {
            EnterableState owner = original.getParentEnterableState();
            if (owner == null) return;

            String location = original.getLocation();
            Context scope = context.getContext(owner);
            Object value = scope != null && scope.has(location)
                    ? scope.get(location) : "<value unavailable>";

            observer.onAssignment(owner.getId(), location, original.getExpr(), value);
        } catch (ModelException | RuntimeException ignored) {
            // Monitoring must not affect a successfully executed assignment.
        }
    }
}
