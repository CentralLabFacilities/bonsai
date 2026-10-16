package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import org.apache.commons.scxml2.ActionExecutionContext;
import org.apache.commons.scxml2.Context;
import org.apache.commons.scxml2.SCXMLExpressionException;
import org.apache.commons.scxml2.env.SimpleContext;
import org.apache.commons.scxml2.model.Assign;
import org.apache.commons.scxml2.model.ModelException;
import org.apache.commons.scxml2.model.OnEntry;
import org.apache.commons.scxml2.model.State;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

public class ObservableAssignTest {
    private static class TestExecutionContext extends ActionExecutionContext {
        private final Context variables;

        TestExecutionContext(Context variables) {
            super(null);
            this.variables = variables;
        }

        @Override
        public Context getContext(org.apache.commons.scxml2.model.EnterableState state) {
            return variables;
        }
    }

    private static Assign action(String location, Context variables, AtomicInteger calls) {
        State state = new State();
        state.setId("Talk");
        OnEntry entry = new OnEntry();
        state.addOnEntry(entry);

        Assign original = new Assign() {
            @Override
            public void execute(ActionExecutionContext context)
                    throws ModelException, SCXMLExpressionException {
                calls.incrementAndGet();
                variables.setLocal(location, 7);  // Simulates the original Apache assignment.
            }
        };
        original.setLocation(location);
        original.setExpr("value + 1");
        original.setParent(entry);
        return original;
    }

    @Test
    public void reportsStoredValueAfterSuccessfulAssignment() throws Exception {
        Context variables = new SimpleContext();
        AtomicInteger calls = new AtomicInteger();
        List<String> events = new ArrayList<>();
        ObservableAssign wrapped = ObservableAssign.from(action("_counter", variables, calls),
                (source, location, expr, old, known, present, value) -> events.add(source + ":" + location + "=" + value));
        TestExecutionContext exctx = new TestExecutionContext(variables);

        wrapped.execute(exctx);
        wrapped.execute(exctx);

        assertEquals(2, calls.get());
        assertEquals(List.of("Talk:_counter=7", "Talk:_counter=7"), events);
    }

    @Test
    public void readsPreviousValueBeforeEachAssignment() throws Exception {
        Context variables = new SimpleContext();
        variables.setLocal("counter", 2);
        State state = new State(); state.setId("B");
        OnEntry entry = new OnEntry(); state.addOnEntry(entry);
        Assign original = new Assign() {
            @Override public void execute(ActionExecutionContext context) {
                variables.set("counter", ((Number) variables.get("counter")).intValue() + 10);
            }
        };
        original.setParent(entry);
        original.setLocation("counter");
        List<String> recorded = new ArrayList<>();
        ObservableAssign observable = ObservableAssign.from(original,
                (owner, location, expr, old, known, present, value) ->
                        recorded.add(owner + ":" + old + "->" + value + ":" + known + ":" + present));
        observable.execute(new TestExecutionContext(variables));
        observable.execute(new TestExecutionContext(variables));
        assertEquals(List.of("B:2->12:true:true", "B:12->22:true:true"), recorded);
    }

    @Test
    public void doesNotPublishWhenOriginalThrows() {
        State state = new State(); state.setId("Failed");
        OnEntry entry = new OnEntry(); state.addOnEntry(entry);
        Assign broken = new Assign() {
            @Override public void execute(ActionExecutionContext ctx) throws ModelException {
                throw new ModelException();
            }
        };
        broken.setParent(entry);
        List<String> events = new ArrayList<>();
        ObservableAssign observable = ObservableAssign.from(broken,
                (stateId, loc, expr, old, known, present, val) -> events.add(stateId));
        boolean failed = false;
        try {
            observable.execute(new TestExecutionContext(new SimpleContext()));
        } catch (ModelException expected) {
            failed = true;
        } catch (SCXMLExpressionException e) {
            throw new AssertionError(e);
        }
        assertTrue(failed);
        assertTrue(events.isEmpty());
    }

    @Test
    public void monitoringExceptionsDoNotInterruptExecution() throws Exception {
        Context variables = new SimpleContext();
        AtomicInteger calls = new AtomicInteger();
        ObservableAssign observable = ObservableAssign.from(action("counter", variables, calls),
                (stateId, loc, expr, old, known, present, val) -> { throw new IllegalStateException("monitor offline"); });
        observable.execute(new TestExecutionContext(variables));
        assertEquals(1, calls.get());
        assertEquals(7, variables.get("counter"));
    }

    @Test
    public void missingOwningStateStillExecutesOriginal() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        Assign unowned = new Assign() {
            @Override public void execute(ActionExecutionContext ctx) { calls.incrementAndGet(); }
        };
        List<String> events = new ArrayList<>();
        ObservableAssign.from(unowned, (s, l, e, old, known, present, v) -> events.add(s))
                .execute(new TestExecutionContext(new SimpleContext()));
        assertEquals(1, calls.get());
        assertTrue(events.isEmpty());
    }
}
