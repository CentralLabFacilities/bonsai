package de.unibi.citec.clf.bonsai.engine.communication.web

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.assertFalse
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class RuntimeEventStreamTest {
    @Test fun serializationContainsOnlyRuntimeEventFields() {
        val event = RuntimeEventMessage("status", "2026-10-20T09:00:00Z", mapOf("value" to "RUNNING"))
        val json = Json.encodeToString(event)
        assertTrue(json.contains("\"type\":\"status\""))
        assertFalse(json.contains("\"datamodel\""))
        assertFalse(json.contains("\"slots\""))
    }

    @Test fun acknowledgeSubscriptionThenSendContiguousEventsWithoutReplayingHistory() {
        val recorded = mutableListOf<RuntimeEventMessage>()
        val stream = RuntimeEventStream(subscriberCapacity = 8, onCommitted = { recorded.add(it) })
        stream.publish(RuntimeEventMessage("status", "2026-10-20T09:00:00Z", mapOf("value" to "LOADING")))
        val subscription = stream.subscribe()
        val ready = subscription.channel.tryReceive().getOrThrow()
        assertEquals("stream_ready", ready.type)
        assertEquals(1L, ready.sequence)
        assertEquals(1, recorded.size) // acknowledgement is not a recorded runtime event
        stream.publish(RuntimeEventMessage("datamodel_scope_initialized", "2026-10-20T09:00:01Z",
            mapOf("scope" to "global", "valuesJson" to "{\"count\":0}")))
        stream.publish(RuntimeEventMessage("datamodel_assignment", "2026-10-20T09:00:02Z", mapOf("newValue" to "1")))
        val first = subscription.channel.tryReceive().getOrThrow()
        val second = subscription.channel.tryReceive().getOrThrow()
        assertEquals(ready.sequence + 1, first.sequence)
        assertEquals(first.sequence + 1, second.sequence)
        assertEquals(ready.runId, second.runId)
        assertEquals(3, recorded.size)
        stream.unsubscribe(subscription)
        stream.close()
    }

    @Test fun slowClientIsClosedAndOtherClientsStillReceiveEvents() {
        val stream = RuntimeEventStream(subscriberCapacity = 2)
        val slow = stream.subscribe()
        val fast = stream.subscribe()
        slow.channel.tryReceive().getOrThrow()
        fast.channel.tryReceive().getOrThrow()
        repeat(5) {
            stream.publish(RuntimeEventMessage("status", "2026-10-20T09:00:00Z", mapOf("value" to "RUNNING")))
            assertTrue(fast.channel.tryReceive().isSuccess)
        }
        assertTrue(slow.channel.isClosedForSend)
        stream.unsubscribe(fast)
        stream.close()
    }
}
