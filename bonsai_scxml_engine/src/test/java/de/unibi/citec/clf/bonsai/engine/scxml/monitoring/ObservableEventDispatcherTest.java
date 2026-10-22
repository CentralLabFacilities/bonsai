package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import org.apache.commons.scxml2.EventDispatcher;
import org.apache.commons.scxml2.SCXMLIOProcessor;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class ObservableEventDispatcherTest {
    private static class Delegate implements EventDispatcher {
        int sends;
        int cancels;
        boolean fail;
        @Override public void send(Map<String, SCXMLIOProcessor> ioProcessors, String id,
                String target, String type, String event, Object data, Object hints, long delay) {
            sends++;
            if (fail) throw new IllegalStateException("dispatch failed");
        }
        @Override public void cancel(String sendId) { cancels++; }
        @Override public EventDispatcher newInstance() { return new Delegate(); }
    }

    @Test
    public void sendsOriginalArgumentsAndReportsAfterDispatch() {
        Delegate delegate = new Delegate();
        List<String> observed = new ArrayList<>();
        ObservableEventDispatcher dispatcher = new ObservableEventDispatcher(delegate,
                (id, target, type, event, data, delay) -> {
                    assertEquals(1, delegate.sends);
                    observed.add(id + ":" + target + ":" + type + ":" + event + ":" + data + ":" + delay);
                });
        dispatcher.send(Map.of(), "req-1", "#_internal", "scxml", "Pick.done", "cup", null, 250);
        assertEquals(List.of("req-1:#_internal:scxml:Pick.done:cup:250"), observed);
    }

    @Test
    public void cancellationAndFailuresKeepOriginalSemantics() {
        Delegate delegate = new Delegate();
        List<String> observed = new ArrayList<>();
        ObservableEventDispatcher dispatcher = new ObservableEventDispatcher(delegate,
                (id, target, type, event, data, delay) -> observed.add(event));
        dispatcher.cancel("req-1");
        assertEquals(1, delegate.cancels);
        delegate.fail = true;
        try {
            dispatcher.send(Map.of(), "id", null, "scxml", "never", null, null, 0);
            throw new AssertionError("Expected exception");
        } catch (IllegalStateException expected) { }
        assertTrue(observed.isEmpty());
        delegate.fail = false;
        ObservableEventDispatcher withBrokenObserver = new ObservableEventDispatcher(delegate,
                (id, target, type, event, data, delay) -> { throw new IllegalStateException("subscriber failed"); });
        withBrokenObserver.send(Map.of(), "id", null, "scxml", "okay", null, null, 0);
        assertEquals(2, delegate.sends);
    }

    @Test
    public void newInstanceCreatesIndependentDelegateAndPreservesObserver() {
        Delegate originalDelegate = new Delegate();
        List<String> observed = new ArrayList<>();
        ObservableEventDispatcher original = new ObservableEventDispatcher(
                originalDelegate, (id, target, type, event, data, delay) -> observed.add(event));

        EventDispatcher child = original.newInstance();
        assertTrue(child instanceof ObservableEventDispatcher);
        assertNotSame(original, child);
        child.send(Map.of(), "id", null, "scxml", "child", null, null, 0);
        assertEquals(0, originalDelegate.sends);
        original.send(Map.of(), "id", null, "scxml", "parent", null, null, 0);
        assertEquals(1, originalDelegate.sends);
        assertEquals(List.of("child", "parent"), observed);
    }
}
