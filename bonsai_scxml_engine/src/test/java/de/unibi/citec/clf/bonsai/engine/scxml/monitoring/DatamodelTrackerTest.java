package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import de.unibi.citec.clf.bonsai.core.events.BonsaiEvent;
import de.unibi.citec.clf.bonsai.core.events.BonsaiEventBus;
import org.apache.commons.scxml2.Context;
import org.apache.commons.scxml2.env.jexl.JexlEvaluator;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import static org.junit.Assert.*;

public class DatamodelTrackerTest {
    @Test
    public void snapshotsAndRegistrationNeverPublishAssignments() {
        DatamodelTracker tracker = new DatamodelTracker();
        Context global = new JexlEvaluator().newContext(null);
        global.setLocal("_counter", 3);
        tracker.trackGlobalContext(global);
        tracker.trackContext("PickObject", new JexlEvaluator().newContext(global));
        List<BonsaiEvent> events = new ArrayList<>();
        Consumer<BonsaiEvent> listener = events::add;
        BonsaiEventBus.subscribe(listener);
        try {
            tracker.snapshot();
            assertEquals("3", tracker.snapshot().get("global").get("_counter"));
            tracker.trackGlobalContext(global);
            assertTrue(events.isEmpty());
        } finally {
            BonsaiEventBus.unsubscribe(listener);
        }
    }

    @Test
    public void stateLocalVariablesAppearOnlyInSnapshots() {
        DatamodelTracker tracker = new DatamodelTracker();
        Context global = new JexlEvaluator().newContext(null);
        Context local = new JexlEvaluator().newContext(global);
        local.setLocal("_counter", 2);
        tracker.trackGlobalContext(global);
        tracker.trackContext("PickObject", local);

        assertEquals("2", tracker.snapshot().get("PickObject").get("_counter"));
        assertFalse(tracker.snapshot().get("global").containsKey("_counter"));
    }

    @Test
    public void resetOnlyClearsSnapshots() {
        DatamodelTracker tracker = new DatamodelTracker();
        Context context = new JexlEvaluator().newContext(null);
        tracker.trackGlobalContext(context);
        context.setLocal("x", 1);
        assertFalse(tracker.snapshot().isEmpty());
        tracker.reset();
        assertTrue(tracker.snapshot().isEmpty());
    }
}
