package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import org.apache.commons.scxml2.model.Action;
import org.apache.commons.scxml2.model.ActionsContainer;
import org.apache.commons.scxml2.model.Assign;
import org.apache.commons.scxml2.model.EnterableState;
import org.apache.commons.scxml2.model.Executable;
import org.apache.commons.scxml2.model.SCXML;
import org.apache.commons.scxml2.model.State;
import org.apache.commons.scxml2.model.Transition;
import org.apache.commons.scxml2.model.TransitionalState;
import org.jetbrains.annotations.NotNull;

import java.util.List;
import java.util.Objects;

/**
 * Installs assignment monitoring in a parsed SCXML model.
 *
 * <p>Traverses state entry/exit actions, transitions, initial transitions, and
 * nested action containers. Only standard {@code <assign>} actions are wrapped
 * with {@link ObservableAssign}; other actions retain their original behavior
 * and execution order. An already wrapped assignment is reused rather than
 * wrapped again.</p>
 */
public final class AssignInstrumenter {
    private AssignInstrumenter() { }

    /**
     * Installs or updates the assignment observer for the given SCXML model.
     * Call this before executing the parsed model.
     *
     * @param model parsed SCXML model to instrument
     * @param observer callback notified after a successful assignment
     * @throws NullPointerException if {@code model} or {@code observer} is null
     */
    public static void instrument(@NotNull SCXML model, @NotNull ObservableAssign.AssignmentObserver observer) {
        traverseExecutable(model.getInitialTransition(), observer);
        for (EnterableState child : model.getChildren()) traverseState(child, observer);
    }

    /** Visits a state and recursively processes its nested states and executables. */
    private static void traverseState(EnterableState state, ObservableAssign.AssignmentObserver observer) {
        state.getOnEntries().forEach(entry -> traverseExecutable(entry, observer));
        state.getOnExits().forEach(exit -> traverseExecutable(exit, observer));
        if (state instanceof TransitionalState transitional) {
            for (Transition transition : transitional.getTransitionsList()) {
                traverseExecutable(transition, observer);
            }
            if (state instanceof State compound && compound.getInitial() != null) {
                traverseExecutable(compound.getInitial().getTransition(), observer);
            }
            for (EnterableState child : transitional.getChildren()) traverseState(child, observer);
        }
    }

    /** Instruments the actions held by an executable container, when present. */
    private static void traverseExecutable(Executable executable, ObservableAssign.AssignmentObserver observer) {
        if (executable != null) instrumentActions(executable.getActions(), observer);
    }

    /**
     * Replaces standard assignments in place and visits nested action containers.
     * Existing wrappers receive the latest observer, allowing model reuse.
     */
    private static void instrumentActions(List<Action> actions, ObservableAssign.AssignmentObserver observer) {
        for (int i = 0; i < actions.size(); i++) {
            Action action = actions.get(i);
            if (action instanceof ObservableAssign wrapped) {
                // Re-instrumentation should update the listener rather than double-wrap.
                wrapped.setObserver(observer);
            } else if (action.getClass() == Assign.class) {
                // Never replace custom Assign subclasses with overridden behavior.
                actions.set(i, ObservableAssign.from((Assign) action, observer));
            } else if (action instanceof ActionsContainer container) {
                instrumentActions(container.getActions(), observer);
            }
        }
    }
}
