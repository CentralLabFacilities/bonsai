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
        void onAssignment(String sourceState, Context declaringContext, String location, String expression,
                          Object before, boolean beforeKnown, boolean beforePresent, Object value);
        /** Called before the original assignment to capture newly created scopes. */
        default void beforeAssignment(String sourceState, Context context) { }
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
        // Resolve a simple location without evaluating the expression twice.
        // Reading nested/indexed locations by literal Context.get would be incorrect.
        EnterableState owner = null;
        try { owner = original.getParentEnterableState(); }
        catch (ModelException | RuntimeException ignored) { /* only observation is unavailable */ }
        String location = original.getLocation();
        Context ctx = null;
        boolean plain = location != null && location.matches("[A-Za-z_#$][A-Za-z0-9_#$]*");
        boolean beforeKnown = false;
        boolean beforePresent = false;
        Object before = null;
        if (owner != null && plain) {
            try {
                ctx = context.getContext(owner);
                beforeKnown = ctx != null;
                beforePresent = beforeKnown && ctx.has(location);
                if (beforePresent) before = SCXMLRuntimeMonitor.captureValue(ctx.get(location));
            } catch (RuntimeException ignored) { beforeKnown = false; }
        }

        // Emit scope initialization before the very first onentry assignment.
        if (owner != null) {
            try { observer.beforeAssignment(owner.getId(), context.getContext(owner)); }
            catch (RuntimeException ignored) { /* observation only */ }
        }
        // Apache's original action retains execution semantics and errors.
        original.execute(context);
        try {
            if (owner == null) return;
            if (!plain) {
                observer.onAssignment(owner.getId(), null, location, original.getExpr(), null,
                        false, false, null);
                return;
            }
            if (ctx == null) ctx = context.getContext(owner);
            if (ctx == null || !ctx.has(location)) return;
            Context declaring = ctx;
            while (declaring != null && !declaring.hasLocal(location)) declaring = declaring.getParent();
            if (declaring == null) return;
            // Identify global vs state-local storage. For local ancestor scopes,
            // the monitor's context registry determines the exact owner.
            observer.onAssignment(owner.getId(), declaring, location, original.getExpr(),
                    before, beforeKnown, beforePresent, ctx.get(location));
        } catch (RuntimeException ignored) {
            // Failed monitoring never changes successful SCXML execution.
        }
    }
}
