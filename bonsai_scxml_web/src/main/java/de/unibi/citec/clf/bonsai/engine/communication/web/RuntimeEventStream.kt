package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEvent
import kotlinx.coroutines.channels.Channel
import kotlinx.serialization.Serializable
import java.util.ArrayDeque
import java.util.UUID

/** A wire event; sequence is monotonic within runId, and details contains change values. */
@Serializable
data class RuntimeEventMessage(
    val type: String,
    val timestamp: String,
    val details: Map<String, String> = emptyMap(),
    val sequence: Long = 0,
    val runId: String = ""
)

/** Optional current-state snapshot for initialisation and gap recovery. */
@Serializable
data class RuntimeSnapshotMessage(
    val type: String,
    val timestamp: String,
    val details: Map<String, String>,
    val states: List<String>,
    val datamodel: Map<String, Map<String, String>>
)

@Serializable
data class RuntimeStreamControl(
    val type: String,
    val runId: String,
    val sequence: Long,
    val earliestSequence: Long,
    val reason: String? = null
)

class RuntimeStreamOverflow : RuntimeException("Client event queue overflow; resynchronize")

/**
 * Bounded in-memory replay plus per-client queues. Event publication never waits
 * for a browser. Slow clients are disconnected explicitly rather than silently
 * dropping state changes. All replay subscription/publish operations are atomic.
 * The JSONL recorder remains the durable long-term history.
 */
class RuntimeEventStream(
    private val historyCapacity: Int = 16384,
    private val subscriberCapacity: Int = 4096
) {
    init {
        require(historyCapacity > 0 && subscriberCapacity > 0)
    }

    data class Subscription(
        val channel: Channel<RuntimeEventMessage>?,
        val replay: List<RuntimeEventMessage>,
        val runId: String,
        val sequence: Long,
        val earliestSequence: Long,
        val gap: Boolean
    )

    private val lock = Any()
    private val runId = UUID.randomUUID().toString()
    private val history = ArrayDeque<RuntimeEventMessage>()
    private val subscribers = mutableSetOf<Channel<RuntimeEventMessage>>()
    private var sequence = 0L
    private var closed = false

    fun subscribe(afterSequence: Long? = null, requestedRunId: String? = null): Subscription =
        synchronized(lock) {
            val earliest = history.peekFirst()?.sequence ?: sequence + 1
            val gap = (requestedRunId != null && requestedRunId != runId) ||
                (afterSequence != null && (afterSequence < earliest - 1 || afterSequence > sequence))
            if (gap || closed) {
                Subscription(null, emptyList(), runId, sequence, earliest, true)
            } else {
                val channel = Channel<RuntimeEventMessage>(subscriberCapacity)
                val backlog = if (afterSequence == null) emptyList() else
                    history.filter { it.sequence > afterSequence }
                subscribers.add(channel)
                Subscription(channel, backlog, runId, sequence, earliest, false)
            }
        }

    fun unsubscribe(subscription: Subscription) {
        synchronized(lock) {
            subscription.channel?.let { subscribers.remove(it); it.close() }
        }
    }

    fun control(type: String, reason: String? = null): RuntimeStreamControl = synchronized(lock) {
        RuntimeStreamControl(type, runId, sequence,
            history.peekFirst()?.sequence ?: sequence + 1, reason)
    }

    fun publish(event: BonsaiEvent) {
        val mapped = RuntimeEventMapper.toMessage(event) ?: return
        synchronized(lock) {
            if (closed) return
            val message = mapped.copy(sequence = ++sequence, runId = runId)
            history.addLast(message)
            if (history.size > historyCapacity) history.removeFirst()
            for (subscriber in subscribers.toList()) {
                if (subscriber.trySend(message).isFailure) {
                    subscriber.close(RuntimeStreamOverflow())
                    subscribers.remove(subscriber)
                }
            }
        }
    }

    fun close() {
        synchronized(lock) {
            closed = true
            subscribers.forEach { it.close() }
            subscribers.clear()
        }
    }
}
