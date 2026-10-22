package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.commons.scxml2.ActionExecutionContext;
import org.apache.commons.scxml2.Context;
import org.apache.commons.scxml2.Evaluator;
import org.apache.commons.scxml2.env.jexl.JexlContext;
import org.apache.commons.scxml2.env.jexl.JexlEvaluator;
import org.apache.commons.scxml2.model.*;
import org.junit.Test;

import static org.junit.Assert.*;

public class AssignInstrumenterTest {
    /**
     * Supplies the services used by a real SCXML {@code <assign>} without starting an executor.
     * In particular, ActionExecutionContext(null) cannot use its inherited accessors:
     * their default implementations dereference the missing SCXMLExecutionContext.
     */
    private static ActionExecutionContext testExecutionContext(Context variables) {
        Evaluator evaluator = new JexlEvaluator();
        Log log = LogFactory.getLog(AssignInstrumenterTest.class);
        return new ActionExecutionContext(null) {
            @Override
            public Context getContext(EnterableState state) {
                return variables;
            }

            @Override
            public Evaluator getEvaluator() {
                return evaluator;
            }

            @Override
            public Log getAppLog() {
                return log;
            }
        };
    }

    private static Assign assign(Executable parent, String location, String expression) {
        Assign assign = new Assign();
        assign.setParent(parent);
        assign.setLocation(location);
        assign.setExpr(expression);
        return assign;
    }

    @Test
    public void instrumentsNestedIfForeachAndRetainsParentAndOrder() throws Exception {
        SCXML model = new SCXML();
        State state = new State();
        state.setId("PickObject");
        model.addChild(state);
        OnEntry onEntry = new OnEntry();
        state.addOnEntry(onEntry);
        If condition = new If();
        condition.setParent(onEntry);
        onEntry.addAction(condition);
        Foreach loop = new Foreach();
        loop.setParent(onEntry);
        condition.addAction(loop);
        Assign nested = assign(onEntry, "_target", "item");
        loop.addAction(nested);
        Else alternative = new Else();
        alternative.setParent(onEntry);
        condition.addAction(alternative);
        Assign fallback = assign(onEntry, "_target", "null");
        condition.addAction(fallback);

        AssignInstrumenter.instrument(model, (s, l, e, v) -> { });
        assertSame(condition, onEntry.getActions().get(0));
        assertSame(loop, condition.getActions().get(0));
        assertSame(alternative, condition.getActions().get(1));
        assertTrue(loop.getActions().get(0) instanceof ObservableAssign);
        assertTrue(condition.getActions().get(2) instanceof ObservableAssign);
        ObservableAssign replacement = (ObservableAssign) loop.getActions().get(0);
        assertSame(onEntry, replacement.getParent());
        assertEquals("PickObject", replacement.getParentEnterableState().getId());
        assertEquals("_target", nested.getLocation());
        assertEquals("item", nested.getExpr());

        AssignInstrumenter.instrument(model, (s, l, e, v) -> { });
        assertSame(replacement, loop.getActions().get(0)); // Idempotent
    }

    @Test
    public void instrumentsTransitionOnExitAndNestedState() {
        SCXML model = new SCXML();
        State state = new State(); state.setId("Compound"); model.addChild(state);
        State child = new State(); child.setId("Child"); state.addChild(child);
        OnExit exit = new OnExit(); child.addOnExit(exit);
        exit.addAction(assign(exit, "value", "1"));
        Transition transition = new Transition();
        state.addTransition(transition);
        transition.addAction(assign(transition, "value", "2"));
        AssignInstrumenter.instrument(model, (s, l, e, v) -> { });
        assertTrue(exit.getActions().get(0) instanceof ObservableAssign);
        assertTrue(transition.getActions().get(0) instanceof ObservableAssign);
    }
    @Test
    public void leavesSendActionsUnmodifiedAndPreservesOrder() {
        SCXML model = new SCXML();
        State state = new State(); state.setId("SendState"); model.addChild(state);
        OnEntry entry = new OnEntry(); state.addOnEntry(entry);
        Send send = new Send(); send.setParent(entry);
        Send custom = new Send() { }; custom.setParent(entry);
        Assign assignment = assign(entry, "counter", "1");
        entry.addAction(send);
        entry.addAction(assignment);
        entry.addAction(custom);

        AssignInstrumenter.instrument(model, (s, l, e, v) -> { });
        assertSame(send, entry.getActions().get(0));
        assertTrue(entry.getActions().get(1) instanceof ObservableAssign);
        assertSame(custom, entry.getActions().get(2));
        AssignInstrumenter.instrument(model, (s, l, e, v) -> { });
        assertSame(send, entry.getActions().get(0));
    }

    @Test
    public void preservesCustomAssignSubclassesWithoutWrapping() {
        SCXML model = new SCXML();
        State state = new State(); state.setId("State"); model.addChild(state);
        OnEntry entry = new OnEntry(); state.addOnEntry(entry);
        Assign custom = new Assign() { };
        custom.setParent(entry);
        entry.addAction(custom);
        AssignInstrumenter.instrument(model, (s, l, e, v) -> { });
        assertSame(custom, entry.getActions().get(0));
    }

    @Test
    public void wrapperDelegatesExecutionToOriginalAssign() throws Exception {
        java.util.concurrent.atomic.AtomicInteger executions = new java.util.concurrent.atomic.AtomicInteger();
        Assign original = new Assign() {
            @Override
            public void execute(ActionExecutionContext context)
                    throws ModelException, org.apache.commons.scxml2.SCXMLExpressionException {
                executions.incrementAndGet();
            }
        };
        OnEntry entry = new OnEntry();
        State state = new State();
        state.setId("PickObject");
        state.addOnEntry(entry);
        original.setParent(entry);
        ObservableAssign observable = ObservableAssign.from(original, (s, l, e, v) -> { });
        assertSame(entry, observable.getParent());
        observable.execute(testExecutionContext(new JexlContext()));
        assertEquals(1, executions.get());
    }

    @Test
    public void missingOwnerDoesNotPreventOriginalExecution() throws Exception {
        java.util.concurrent.atomic.AtomicInteger executions = new java.util.concurrent.atomic.AtomicInteger();
        Assign original = new Assign() {
            @Override
            public void execute(ActionExecutionContext context)
                    throws ModelException, org.apache.commons.scxml2.SCXMLExpressionException {
                executions.incrementAndGet();
            }
        };
        // There is deliberately no owning state.
        ObservableAssign.from(original, (s, l, e, v) -> { })
                .execute(testExecutionContext(new JexlContext()));
        assertEquals(1, executions.get());
    }


    @Test
    public void reinstrumentationRebindsObserverWithoutDoubleWrapping() throws Exception {
        SCXML model = new SCXML();
        State state = new State(); state.setId("PickObject"); model.addChild(state);
        OnEntry entry = new OnEntry(); state.addOnEntry(entry);
        Assign original = assign(entry, "counter", "1"); entry.addAction(original);
        java.util.List<String> first = new java.util.ArrayList<>();
        java.util.List<String> second = new java.util.ArrayList<>();
        AssignInstrumenter.instrument(model, (s, l, e, v) -> first.add(s));
        Action wrapper = entry.getActions().get(0);
        AssignInstrumenter.instrument(model, (s, l, e, v) -> second.add(s));
        assertSame(wrapper, entry.getActions().get(0));
        Context variables = new JexlContext();
        variables.setLocal("counter", 42);
        ((ObservableAssign) wrapper).execute(testExecutionContext(variables));
        assertTrue(first.isEmpty());
        assertEquals(java.util.List.of("PickObject"), second);
    }
}
