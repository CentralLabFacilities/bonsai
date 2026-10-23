package de.unibi.citec.clf.bonsai.engine.scxml;

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.SCXMLEvent;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventPublisher;
import de.unibi.citec.clf.bonsai.engine.communication.StateChangePublisher;
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
        long droppedBefore = SCXMLEventPublisher.getStatus().dropped();
        SCXMLEventPublisher.addListener(listener);
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
                    droppedBefore, SCXMLEventPublisher.getStatus().dropped());

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
            int stoppedIndex = indexOf(events, e -> "stopped".equals(e.type()));

            assertPresent("started", started, events);
            assertPresent("global datamodel initialization val=false", initial, events);
            assertPresent("first state entered", firstEntry, events);
            assertPresent("assignment val=true", assignment, events);
            assertPresent("declared wildcard transition", transition, events);
            assertPresent("second state entered", secondEntry, events);
            assertPresent("End entered", end, events);
            assertPresent("stopped", stoppedIndex, events);
            assertTrue("Initialization must precede the value change", initial < assignment);
            assertTrue("First state must be entered before its transition", firstEntry < transition);
            assertTrue("Second state follows first", firstEntry < secondEntry);
            assertTrue("End must occur before explicit stop", end < stoppedIndex);
            assertEquals("The fixture has exactly one <assign location=\"val\">", 1,
                    events.stream().filter(e -> "datamodel_assignment".equals(e.type())
                            && "val".equals(e.details().get("location"))).count());
        } finally {
            SCXMLEventPublisher.removeListener(listener);
        }
    }

    @Test
    public void loadedWildcardScxmlPreservesLegacyTransitionAndAssignmentValues() throws Exception {
        assertNotNull(getClass().getResource("/state_machines/variables.xml"));
        List<SCXMLEvent> received = new CopyOnWriteArrayList<>();
        List<String> legacyTransitions = new CopyOnWriteArrayList<>();
        CountDownLatch stopped = new CountDownLatch(1);
        StateChangePublisher legacy = new StateChangePublisher() {
            @Override
            public void publish(String from, String to, String transition) {
                legacyTransitions.add(from + " -> " + to + " : " + transition);
            }
        };
        Consumer<SCXMLEvent> listener = event -> {
            received.add(event);
            if ("stopped".equals(event.type())) stopped.countDown();
        };
        // Registration order matters: both callbacks run on the same worker;
        // the legacy callback for an event runs before this listener sees it.
        SCXMLEventPublisher.addListener(legacy);
        SCXMLEventPublisher.addListener(listener);
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
            SCXMLEventPublisher.removeListener(listener);
            SCXMLEventPublisher.removeListener(legacy);
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
