package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import de.unibi.citec.clf.bonsai.engine.communication.RuntimeChanges.RuntimeChange;
import org.apache.commons.scxml2.Context;
import org.apache.commons.scxml2.env.SimpleContext;
import org.apache.commons.scxml2.model.EnterableState;
import org.apache.commons.scxml2.model.Final;
import org.apache.commons.scxml2.model.ModelException;
import org.apache.commons.scxml2.model.State;
import org.apache.commons.scxml2.model.SCXML;
import org.apache.commons.scxml2.env.jexl.JexlEvaluator;
import java.util.Map;
import org.apache.commons.scxml2.model.Transition;
import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

public class SCXMLRuntimeMonitorTest {
    private static class TestExecutor extends ObservableSCXMLExecutor {
        final Context local = new SimpleContext();
        final Map<String, Context> contexts = new java.util.HashMap<>();
        TestExecutor() {
            try {
                setEvaluator(new JexlEvaluator());
                setStateMachine(new SCXML());
            } catch (ModelException e) { throw new IllegalStateException(e); }
        }
        @Override public Context getContextFor(EnterableState state) {
            return contexts.getOrDefault(state.getId(), local);
        }
    }

    @Test public void preservesShortLivedEntriesAndExits() {
        List<RuntimeChange> changes = new ArrayList<>();
        SCXMLRuntimeMonitor monitor = new SCXMLRuntimeMonitor(new TestExecutor(), changes::add);
        State a = new State(); a.setId("A");
        State b = new State(); b.setId("B");
        Final end = new Final(); end.setId("Done");
        monitor.onEntry(a);
        monitor.onTransition(a, b, new Transition(), "next");
        monitor.onExit(a);
        monitor.onEntry(end);
        // Even an SCXML <final> does not prove whole-machine completion
        // (it may only end one region of a parallel state).
        assertEquals(List.of("state_entered", "transition", "state_exited", "state_entered"),
                changes.stream().map(RuntimeChange::type).toList());
        assertEquals("A", changes.get(1).details().get("source"));
    }

    @Test public void acceptsAssignmentCallbacksWithoutAnAdapter() throws Exception {
        TestExecutor executor = new TestExecutor();
        SCXML model = new SCXML();
        State state = new State(); state.setId("Step"); model.addChild(state);
        executor.setStateMachine(model);
        Context global = executor.getGlobalContext();
        global.setLocal("counter", 0);
        Context local = new SimpleContext(global);
        local.setLocal("attempt", 1);
        executor.contexts.put("Step", local);
        List<RuntimeChange> changes = new ArrayList<>();
        ObservableAssign.AssignmentObserver observer =
                new SCXMLRuntimeMonitor(executor, changes::add);

        observer.beforeAssignment("Step", local);
        observer.onAssignment("Step", local, "attempt", "attempt+1", 1, true, true, 2);
        observer.beforeAssignment("Step", local);

        assertEquals(List.of("datamodel_scope_initialized", "datamodel_scope_initialized",
                "datamodel_assignment"), changes.stream().map(RuntimeChange::type).toList());
        assertEquals("Step", changes.get(2).details().get("scope"));
        assertEquals("1", changes.get(2).details().get("oldValue"));
        assertEquals("2", changes.get(2).details().get("newValue"));
    }

    @Test public void assignsToGlobalContextEvenFromAChildState() {
        TestExecutor executor = new TestExecutor();
        List<RuntimeChange> changes = new ArrayList<>();
        SCXMLRuntimeMonitor monitor = new SCXMLRuntimeMonitor(executor, changes::add);
        monitor.refreshGlobalContext();
        monitor.onDatamodelAssignment("Child", executor.getGlobalContext(), "counter",
                "counter+1", 1, true, true, 2);
        RuntimeChange change = changes.get(0);
        assertEquals("datamodel_assignment", change.type());
        assertEquals("global", change.details().get("scope"));
        assertEquals("1", change.details().get("oldValue"));
        assertEquals("2", change.details().get("newValue"));
    }

    @Test public void distinguishesGlobalAndParentScopedAssignments() throws Exception {
        TestExecutor executor = new TestExecutor();
        SCXML model = new SCXML();
        State parent = new State(); parent.setId("Parent"); model.addChild(parent);
        State child = new State(); child.setId("Child"); parent.addChild(child);
        executor.setStateMachine(model);
        Context global = executor.getGlobalContext();
        Context parentScope = new SimpleContext(global);
        Context childScope = new SimpleContext(parentScope);
        executor.contexts.put("Parent", parentScope);
        executor.contexts.put("Child", childScope);
        global.setLocal("counter", 1);
        parentScope.setLocal("counter", 5);
        List<RuntimeChange> output = new ArrayList<>();
        SCXMLRuntimeMonitor monitor = new SCXMLRuntimeMonitor(executor, output::add);
        monitor.onDatamodelAssignment("Child", parentScope, "counter", "counter+1", 5, true, true, 6);
        assertEquals("Parent", output.get(0).details().get("scope"));
        assertEquals("6", output.get(0).details().get("newValueJson"));
        monitor.onDatamodelAssignment("Child", global, "counter", "counter+1", 1, true, true, 2);
        assertEquals("global", output.get(1).details().get("scope"));
    }

    @Test public void unknownScopeIsNotMisreportedAsGlobal() {
        TestExecutor executor = new TestExecutor();
        List<RuntimeChange> changes = new ArrayList<>();
        SCXMLRuntimeMonitor monitor = new SCXMLRuntimeMonitor(executor, changes::add);
        monitor.onDatamodelAssignment("Orphan", new SimpleContext(), "x", "3", null, false, false, 3);
        assertEquals("observation_incomplete", changes.get(0).type());
        assertEquals(1, changes.size());
    }

    @Test public void typedSnapshotsDoNotTruncateOrConflateNullAndStrings() {
        TestExecutor executor = new TestExecutor();
        SCXMLRuntimeMonitor monitor = new SCXMLRuntimeMonitor(executor, c -> {});
        executor.getGlobalContext().setLocal("int", 12);
        executor.getGlobalContext().setLocal("word", "12");
        executor.getGlobalContext().setLocal("unset", null);
        executor.getGlobalContext().setLocal("nested", Map.of("pose", List.of(1, true)));
        executor.getGlobalContext().setLocal("large", "X".repeat(5000));
        monitor.refreshGlobalContext();
        SCXMLRuntimeMonitor.DatamodelSnapshot snapshot = monitor.captureDatamodelSnapshot();
        assertEquals("12", snapshot.json().get("global").get("int"));
        assertEquals("\"12\"", snapshot.json().get("global").get("word"));
        assertEquals("null", snapshot.json().get("global").get("unset"));
        assertEquals("{\"pose\":[1,true]}", snapshot.json().get("global").get("nested"));
        assertEquals(5000, snapshot.text().get("global").get("large").length());
        monitor.resetDatamodelTracking();
        assertTrue(monitor.captureDatamodelSnapshot().text().isEmpty());
    }

    @Test public void unsupportedJavaValuesAreExplicitlyMarked() {
        TestExecutor executor = new TestExecutor();
        SCXMLRuntimeMonitor monitor = new SCXMLRuntimeMonitor(executor, c -> {});
        executor.getGlobalContext().setLocal("opaque", new Object());
        monitor.refreshGlobalContext();
        assertTrue(monitor.captureDatamodelSnapshot().json().get("global").get("opaque")
                .contains("$bonsaiUnsupportedType"));
    }
}
