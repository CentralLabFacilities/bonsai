package de.unibi.citec.clf.bonsai.engine.communication.web

import kotlinx.coroutines.channels.Channel
import kotlinx.serialization.Serializable
import java.util.UUID

/** Ordered live runtime message. No state snapshots or replay protocol. */
@Serializable
data class RuntimeEventMessage(
    val type: String,
    val timestamp: String,
    val details: Map<String, String> = emptyMap(),
    val sequence: Long = 0,
    val runId: String = ""
)

/** An overflowing client loses the connection, not a silently dropped event. */
class RuntimeStreamOverflow : RuntimeException("WebSocket client cannot keep up with runtime changes")

/**
 * Live-only, ordered fan-out. A subscriber receives stream_ready first, which
 * acknowledges registration (and provides the last committed sequence number).
 * No historic events are replayed and no state baseline is constructed.
 */
class RuntimeEventStream(
    private val subscriberCapacity: Int = 4096,
    private val onCommitted: (RuntimeEventMessage) -> Unit = {}
) {
    init { require(subscriberCapacity > 0) }

    class Subscription(val channel: Channel<RuntimeEventMessage>)

    private val lock = Any()
    private val streamId = UUID.randomUUID().toString()
    private val subscribers = mutableSetOf<Channel<RuntimeEventMessage>>()
    private var sequence = 0L
    private var closed = false

    fun subscribe(): Subscription = synchronized(lock) {
        check(!closed) { "Runtime stream has been shut down" }
        val channel = Channel<RuntimeEventMessage>(subscriberCapacity)
        // This acknowledgement is transport metadata, not a runtime event.
        check(channel.trySend(RuntimeEventMessage("stream_ready", java.time.Instant.now().toString(),
            sequence = sequence, runId = streamId)).isSuccess)
        subscribers.add(channel)
        Subscription(channel)
    }

    fun unsubscribe(subscription: Subscription) = synchronized(lock) {
        subscribers.remove(subscription.channel)
        subscription.channel.close()
    }

    fun publish(event: RuntimeEventMessage): RuntimeEventMessage? = synchronized(lock) {
        if (closed) return null
        val message = event.copy(sequence = ++sequence, runId = streamId)
        // The recorder only enqueues; it never writes to disk on this thread.
        try { onCommitted(message) } catch (_: RuntimeException) { }
        for (client in subscribers.toList()) {
            if (client.trySend(message).isFailure) {
                client.close(RuntimeStreamOverflow())
                subscribers.remove(client)
            }
        }
        message
    }

    fun close() = synchronized(lock) {
        closed = true
        subscribers.forEach { it.close() }
        subscribers.clear()
    }
}
