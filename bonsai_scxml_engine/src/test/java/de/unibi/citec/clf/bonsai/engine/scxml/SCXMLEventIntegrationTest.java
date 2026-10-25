package de.unibi.citec.clf.bonsai.engine.scxml;

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.SCXMLEvent;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventBus;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLRuntimeEventAdapter;
import de.unibi.citec.clf.bonsai.engine.communication.StatemachineStatus;
import de.unibi.citec.clf.bonsai.test.TestListener;
import org.apache.log4j.PropertyConfigurator;
import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Predicate;

import static org.junit.Assert.*;

/**
 * End-to-end event tests using the same real SCXML/configuration resources and
 * SkillStateMachine execution path as StatemachineTest, rather than manually
 * constructing SCXML states or calling monitor methods directly.
 *
 * Fixtures:
 *   src/test/resources/state_machines/variablesInDatamodel.xml
 *   src/test/resources/state_machines/variables.xml
 *   src/test/resources/bonsai_configs/TestConfig.xml
 */
public class SCXMLEventIntegrationTest {

    @Before
    public void configureLogging() {
        PropertyConfigurator.configure(getClass().getResource("/testLogging.properties"));
    }

    @Test
    public void loadedScxmlPublishesInitializationAssignmentTransitionsAndCompletion() throws Exception {
        assertNotNull(getClass().getResource("/state_machines/variablesInDatamodel.xml"));
        List<SCXMLEvent> received = new CopyOnWriteArrayList<>();
        CountDownLatch stopped = new CountDownLatch(1);
        Consumer<SCXMLEvent> listener = event -> {
            received.add(event);
            if ("stopped".equals(event.type())) stopped.countDown();
        };
        long droppedBefore = SCXMLEventBus.getStatus().dropped();
        SCXMLEventBus.addListener(listener);
        try {
            // This helper constructs a real SkillStateMachine, loads this fixture,
            // applies TestConfig.xml and executes the test skills until End/Fatal.
            assertTrue("Real SCXML execution did not reach End",
                    TestTools.testStatemachine("TestConfig.xml", "variablesInDatamodel.xml",
                            TestListener.newEndFatal()));
            // testStatemachine() stops the machine in finally. Its event dispatch
            // is asynchronous: End alone does not imply callbacks were delivered.
            assertTrue("Timed out waiting for the published stopped event",
                    stopped.await(5, TimeUnit.SECONDS));

            List<SCXMLEvent> events = new ArrayList<>(received);
            assertStrictlyIncreasingSequence(events);
            assertEquals("Publisher lost events during a small real execution",
                    droppedBefore, SCXMLEventBus.getStatus().dropped());

            int started = indexOf(events, e -> "started".equals(e.type())
                    && "CheckDatamodel#1".equals(e.details().get("initial")));
            int initial = indexOf(events, e -> "datamodel_scope_initialized".equals(e.type())
                    && "global".equals(e.details().get("scope"))
                    && "false".equals(e.values().get("val"))
                    && e.details().getOrDefault("valuesJson", "").contains("\"val\":false"));
            int firstEntry = indexOf(events, e -> "state_entered".equals(e.type())
                    && "CheckDatamodel#1".equals(e.details().get("state")));
            int assignment = indexOf(events, e -> "datamodel_assignment".equals(e.type())
                    && "val".equals(e.details().get("location"))
                    && "global".equals(e.details().get("scope"))
                    && "true".equals(e.details().get("newValueJson")));
            int transition = indexOf(events, e -> "transition".equals(e.type())
                    && "CheckDatamodel#1".equals(e.details().get("source"))
                    && "CheckDatamodel#2".equals(e.details().get("target"))
                    && "CheckDatamodel.*".equals(e.details().get("declaredEvent")));
            int secondEntry = indexOf(events, e -> "state_entered".equals(e.type())
                    && "CheckDatamodel#2".equals(e.details().get("state")));
            int end = indexOf(events, e -> "state_entered".equals(e.type())
                    && "End".equals(e.details().get("state")));
            int completed = indexOf(events, e -> "completed".equals(e.type())
                    && "End".equals(e.details().get("state"))
                    && "success".equals(e.details().get("outcome")));
            int stoppedIndex = indexOf(events, e -> "stopped".equals(e.type()));

            assertPresent("started", started, events);
            assertPresent("global datamodel initialization val=false", initial, events);
            assertPresent("first state entered", firstEntry, events);
            assertPresent("assignment val=true", assignment, events);
            assertPresent("declared wildcard transition", transition, events);
            assertPresent("second state entered", secondEntry, events);
            assertPresent("End entered", end, events);
            assertPresent("natural completion", completed, events);
            assertPresent("stopped", stoppedIndex, events);
            assertTrue("Initialization must precede the value change", initial < assignment);
            assertTrue("First state must be entered before its transition", firstEntry < transition);
            assertTrue("Second state follows first", firstEntry < secondEntry);
            assertTrue("End must occur before completion", end < completed);
            assertTrue("Natural completion must precede explicit stop", completed < stoppedIndex);
            assertEquals("Exactly one completed event per run", 1,
                    events.stream().filter(e -> "completed".equals(e.type())).count());
            assertEquals("The fixture has exactly one <assign location=\"val\">", 1,
                    events.stream().filter(e -> "datamodel_assignment".equals(e.type())
                            && "val".equals(e.details().get("location"))).count());
        } finally {
            SCXMLEventBus.removeListener(listener);
        }
    }

    @Test
    public void loadedWildcardScxmlPreservesLegacyTransitionAndAssignmentValues() throws Exception {
        assertNotNull(getClass().getResource("/state_machines/variables.xml"));
        List<SCXMLEvent> received = new CopyOnWriteArrayList<>();
        List<String> legacyTransitions = new CopyOnWriteArrayList<>();
        CountDownLatch stopped = new CountDownLatch(1);
        SCXMLRuntimeEventAdapter legacy = new SCXMLRuntimeEventAdapter() {
            @Override
            public void publishStateChange(String from, String to, String transition) {
                legacyTransitions.add(from + " -> " + to + " : " + transition);
            }

            @Override
            public void publishStatus(StatemachineStatus status) {
                return;
            }
        };
        Consumer<SCXMLEvent> listener = event -> {
            received.add(event);
            if ("stopped".equals(event.type())) stopped.countDown();
        };
        // Registration order matters: both callbacks run on the same worker;
        // the legacy callback for an event runs before this listener sees it.
        SCXMLEventBus.addListener(legacy);
        SCXMLEventBus.addListener(listener);
        try {
            assertTrue("Real wildcard SCXML execution did not reach End",
                    TestTools.testStatemachine("TestConfig.xml", "variables.xml",
                            TestListener.newEndFatal()));
            assertTrue("Timed out waiting for the published stopped event",
                    stopped.await(5, TimeUnit.SECONDS));

            List<SCXMLEvent> events = new ArrayList<>(received);
            assertStrictlyIncreasingSequence(events);
            assertTrue("Expected a real wildcard transition: " + summarize(events),
                    events.stream().anyMatch(e -> "transition".equals(e.type())
                            && "Talk.*".equals(e.details().get("declaredEvent"))));
            assertTrue("Legacy ROS/FX adapter must still publish declared Talk.*: " + legacyTransitions,
                    legacyTransitions.stream().anyMatch(s -> s.endsWith(" : Talk.*")));
            // The real resource starts hellosToSpeak at 3 and decrements it
            // twice through <assign> before the next transition enters End.
            List<String> resultingCounts = events.stream()
                    .filter(e -> "datamodel_assignment".equals(e.type())
                            && "hellosToSpeak".equals(e.details().get("location")))
                    .map(e -> e.details().get("newValueJson"))
                    .toList();
            assertEquals("Assignments must come from the executed SCXML, in order",
                    List.of("2", "1"), resultingCounts);
        } finally {
            SCXMLEventBus.removeListener(listener);
            SCXMLEventBus.removeListener(legacy);
        }
    }

    @Test
    public void fatalTerminationReportsFailureExactlyOnce() throws Exception {
        List<SCXMLEvent> received = new CopyOnWriteArrayList<>();
        CountDownLatch stopped = new CountDownLatch(1);
        Consumer<SCXMLEvent> listener = event -> {
            received.add(event);
            if ("stopped".equals(event.type())) stopped.countDown();
        };
        SCXMLEventBus.addListener(listener);
        try {
            assertFalse("The failure fixture should reach Fatal",
                    TestTools.testStatemachine("TestConfig.xml", "variablesInDatamodelFailure.xml",
                            TestListener.newEndFatal()));
            assertTrue("Timed out waiting for cleanup", stopped.await(5, TimeUnit.SECONDS));
            List<SCXMLEvent> completions = received.stream()
                    .filter(e -> "completed".equals(e.type())).toList();
            assertEquals("Only one natural completion per run", 1, completions.size());
            assertEquals("Fatal", completions.get(0).details().get("state"));
            assertEquals("failure", completions.get(0).details().get("outcome"));
        } finally {
            SCXMLEventBus.removeListener(listener);
        }
    }

    @Test
    public void stoppingAnUnstartedMachineIsNotNaturalCompletion() throws Exception {
        var pathSM = getClass().getResource("/state_machines/variablesInDatamodel.xml").getPath();
        var pathConfig = getClass().getResource("/bonsai_configs/TestConfig.xml").getPath();
        var skillStateMachine = new de.unibi.citec.clf.bonsai.engine.SkillStateMachine(
                java.util.Map.of("TEST", getClass().getResource("/state_machines").getPath()));
        var controller = new de.unibi.citec.clf.bonsai.engine.control.StateMachineController(
                skillStateMachine, pathConfig, pathSM, false);
        List<SCXMLEvent> received = new CopyOnWriteArrayList<>();
        CountDownLatch stopped = new CountDownLatch(1);
        Consumer<SCXMLEvent> listener = event -> {
            received.add(event);
            if ("stopped".equals(event.type())) stopped.countDown();
        };
        SCXMLEventBus.addListener(listener);
        try {
            assertTrue(controller.load(true).success());
            controller.stopStateMachine();
            assertTrue("Timed out waiting for explicit stop", stopped.await(5, TimeUnit.SECONDS));
            assertTrue("An explicit stop is not natural completion: " + summarize(received),
                    received.stream().noneMatch(e -> "completed".equals(e.type())));
        } finally {
            SCXMLEventBus.removeListener(listener);
        }
    }

    private static int indexOf(List<SCXMLEvent> events, Predicate<SCXMLEvent> matching) {
        for (int i = 0; i < events.size(); i++) {
            if (matching.test(events.get(i))) return i;
        }
        return -1;
    }

    private static void assertPresent(String name, int index, List<SCXMLEvent> events) {
        assertTrue("Missing " + name + " from real execution: " + summarize(events), index >= 0);
    }

    private static void assertStrictlyIncreasingSequence(List<SCXMLEvent> events) {
        long last = 0;
        for (SCXMLEvent event : events) {
            assertTrue("Non-increasing publisher sequence: " + summarize(events),
                    event.sequence() > last);
            last = event.sequence();
        }
    }

    private static String summarize(List<SCXMLEvent> events) {
        return events.stream()
                .map(e -> e.sequence() + ":" + e.type() + e.details())
                .toList().toString();
    }
}
