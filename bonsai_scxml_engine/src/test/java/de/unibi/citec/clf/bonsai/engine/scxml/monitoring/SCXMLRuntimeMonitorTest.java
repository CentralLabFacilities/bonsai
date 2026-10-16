package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEventBus;
import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEvent;
import de.unibi.citec.clf.bonsai.engine.events.ScxmlEvents;
import org.apache.commons.scxml2.Context;
import org.apache.commons.scxml2.env.SimpleContext;
import org.apache.commons.scxml2.env.jexl.JexlEvaluator;
import org.apache.commons.scxml2.model.EnterableState;
import org.apache.commons.scxml2.model.Final;
import org.apache.commons.scxml2.model.ModelException;
import org.apache.commons.scxml2.model.State;
import org.apache.commons.scxml2.model.Transition;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class SCXMLRuntimeMonitorTest {
    private static final class TestExecutor extends ObservableSCXMLExecutor {
        private final Context context = new SimpleContext();

        TestExecutor() {
            try {
                // The default SCXMLExecutor has no evaluator until one is configured.
                // State/global context creation otherwise fails with an NPE.
                setEvaluator(new JexlEvaluator());
            } catch (ModelException e) {
                throw new IllegalStateException("Unable to initialize test SCXML evaluator", e);
            }
        }

        @Override
        public Context getContextFor(EnterableState state) {
            return context;
        }
    }

    @Test
    public void executorHasEvaluatorForGlobalContext() {
        TestExecutor executor = new TestExecutor();
        assertNotNull(executor.getEvaluator());
        assertNotNull(executor.getGlobalContext());
    }

    @Test
    public void reportsStateAndTransitionsWithoutExecutingSkills() {
        SCXMLRuntimeMonitor monitor = new SCXMLRuntimeMonitor(
                new TestExecutor(), state -> "End".equals(state.getId()));
        State pick = new State();
        pick.setId("PickObject");
        State end = new State();
        end.setId("End");
        Final standardFinal = new Final();
        standardFinal.setId("Done");

        List<BonsaiEvent> received = new ArrayList<>();
        Consumer<BonsaiEvent> listener = received::add;
        BonsaiEventBus.subscribe(listener);
        try {
            monitor.onEntry(pick);
            monitor.onTransition(pick, end, new Transition(), "PickObject.success");
            monitor.onExit(pick);
            monitor.onEntry(end);
            monitor.onEntry(standardFinal);

            assertEquals(List.of(ScxmlEvents.StateEntered.class, ScxmlEvents.Transition.class, ScxmlEvents.StateExited.class,
                    ScxmlEvents.StateEntered.class, ScxmlEvents.TerminalState.class, ScxmlEvents.StateEntered.class,
                    ScxmlEvents.TerminalState.class), received.stream().map(Object::getClass).toList());
            ScxmlEvents.Transition transition = (ScxmlEvents.Transition) received.get(1);
            assertEquals("PickObject", transition.source());
            assertEquals("End", transition.target());
            assertEquals("PickObject.success", transition.event());
            assertEquals("End", ((ScxmlEvents.TerminalState) received.get(4)).state());
            assertEquals("Done", ((ScxmlEvents.TerminalState) received.get(6)).state());
            assertTrue(monitor.getDatamodelSnapshot().isEmpty());
        } finally {
            BonsaiEventBus.unsubscribe(listener);
        }
    }

    @Test
    public void publishesEveryAssignmentEvenWhenTheValueDoesNotChange() {
        SCXMLRuntimeMonitor monitor = new SCXMLRuntimeMonitor(
                new TestExecutor(), state -> false);
        List<BonsaiEvent> received = new ArrayList<>();
        Consumer<BonsaiEvent> listener = received::add;
        BonsaiEventBus.subscribe(listener);
        try {
            // No context registration is required to know the action's source state.
            monitor.onDatamodelAssignment("PickObject", "_counter", "counter + 1", 2);
            monitor.onDatamodelAssignment("PickObject", "_counter", "counter + 1", 2);
            assertEquals(2, received.size());
            for (BonsaiEvent event : received) {
                ScxmlEvents.Assignment assignment = (ScxmlEvents.Assignment) event;
                assertEquals("PickObject", assignment.sourceState());
                assertEquals("_counter", assignment.location());
                assertEquals("counter + 1", assignment.expression());
                assertEquals("2", assignment.value());
            }
            assertTrue(monitor.getDatamodelSnapshot().isEmpty());
        } finally {
            BonsaiEventBus.unsubscribe(listener);
        }
    }

    @Test
    public void publishesSendRequestWithEvaluatedValues() {
        SCXMLRuntimeMonitor monitor = new SCXMLRuntimeMonitor(new TestExecutor(), state -> false);
        List<BonsaiEvent> received = new ArrayList<>();
        Consumer<BonsaiEvent> listener = received::add;
        BonsaiEventBus.subscribe(listener);
        try {
            monitor.onSend("req-42", "#_internal", "scxml",
                    "Pick.success", java.util.Map.of("object", "cup"), 500L);
            assertEquals(1, received.size());
            ScxmlEvents.SendRequested event = (ScxmlEvents.SendRequested) received.get(0);
            assertEquals("req-42", event.id());
            assertEquals("#_internal", event.target());
            assertEquals("scxml", event.targetType());
            assertEquals("Pick.success", event.event());
            assertEquals("{object=cup}", event.data());
            assertEquals(500L, event.delayMillis());
        } finally {
            BonsaiEventBus.unsubscribe(listener);
        }
    }

}
