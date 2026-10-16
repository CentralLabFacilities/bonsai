package de.unibi.citec.clf.bonsai.monitoring.events;

import de.unibi.citec.clf.bonsai.monitoring.events.slots.SlotEvents;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import static org.junit.Assert.*;

public class BonsaiEventBusTest {
    @Test
    public void deliversTypedEventAndUnsubscribes() {
        List<BonsaiEvent> received = new ArrayList<>();
        Consumer<BonsaiEvent> listener = received::add;
        BonsaiEventBus.subscribe(listener);
        BonsaiEventBus.subscribe(listener);
        SlotEvents.Written written = SlotEvents.written("/pick/model", "java.lang.String", "cup");
        try {
            BonsaiEventBus.publish(written);
            assertEquals(List.of(written), received);
            assertEquals("cup", ((SlotEvents.Written) received.get(0)).value());
            assertTrue(written.timestamp() != null);
        } finally {
            BonsaiEventBus.unsubscribe(listener);
        }
        BonsaiEventBus.publish(SlotEvents.cleared("/pick/model", "java.lang.String"));
        assertEquals(1, received.size());
    }

    @Test
    public void listenerFailureDoesNotInterruptOtherSubscribers() {
        List<BonsaiEvent> received = new ArrayList<>();
        Consumer<BonsaiEvent> broken = event -> { throw new IllegalStateException("broken"); };
        Consumer<BonsaiEvent> listener = received::add;
        BonsaiEventBus.subscribe(broken);
        BonsaiEventBus.subscribe(listener);
        try {
            BonsaiEventBus.publish(SlotEvents.cleared("slot", "String"));
            assertEquals(1, received.size());
        } finally {
            BonsaiEventBus.unsubscribe(broken);
            BonsaiEventBus.unsubscribe(listener);
        }
    }

}
