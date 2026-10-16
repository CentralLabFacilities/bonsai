package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.engine.events.ScxmlEvents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RuntimeEventStreamTest {
    @Test
    fun replayAndLiveEventsPreservePublishOrder() {
        val stream = RuntimeEventStream(historyCapacity = 4, subscriberCapacity = 2)
        stream.publish(ScxmlEvents.stateEntered("A"))
        stream.publish(ScxmlEvents.stateExited("A"))
        val client = stream.subscribe(afterSequence = 0)
        assertFalse(client.gap)
        assertEquals(listOf(1L, 2L), client.replay.map { it.sequence })
        stream.publish(ScxmlEvents.stateEntered("B"))
        assertEquals(3L, client.channel!!.tryReceive().getOrThrow().sequence)
        stream.unsubscribe(client)
    }

    @Test
    fun expiredHistoryIsReportedInsteadOfSilentlyDropped() {
        val stream = RuntimeEventStream(historyCapacity = 2, subscriberCapacity = 1)
        repeat(3) { stream.publish(ScxmlEvents.stateEntered("A$it")) }
        assertTrue(stream.subscribe(afterSequence = 0).gap)
        val replay = stream.subscribe(afterSequence = 1)
        assertEquals(listOf(2L, 3L), replay.replay.map { it.sequence })
        assertTrue(stream.subscribe(afterSequence = 1, requestedRunId = "wrong-run").gap)
        stream.unsubscribe(replay)
    }

    @Test
    fun slowClientFailsExplicitlyWithoutBlockingPublisher() {
        val stream = RuntimeEventStream(historyCapacity = 10, subscriberCapacity = 1)
        val client = stream.subscribe()
        stream.publish(ScxmlEvents.stateEntered("A"))
        stream.publish(ScxmlEvents.stateEntered("B"))
        assertEquals(1L, client.channel!!.tryReceive().getOrThrow().sequence)
        assertTrue(client.channel.tryReceive().isClosed)
        assertEquals(2L, stream.control("hello").sequence)
    }
}
