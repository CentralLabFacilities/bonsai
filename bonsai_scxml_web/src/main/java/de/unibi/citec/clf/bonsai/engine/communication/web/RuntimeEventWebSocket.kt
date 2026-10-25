package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventBus
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.SCXMLEvent
import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.send
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.apache.log4j.Logger
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.function.Consumer
import kotlin.time.Duration.Companion.milliseconds


class RuntimeEventWebSocket {
    private val log = Logger.getLogger(RuntimeEventWebSocket::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val clients = ConcurrentHashMap.newKeySet<Client>()
    private val started = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val busListener = Consumer<SCXMLEvent> { event ->
        if (!closed.get()) broadcast(serialize(event))
    }
    private var healthJob: Job? = null

    fun start() {
        check(!closed.get()) { "Runtime event WebSocket has been stopped" }
        if (!started.compareAndSet(false, true)) return
        try {
            var previousDropped = SCXMLEventBus.getStatus().dropped()
            SCXMLEventBus.addListener(busListener)
            healthJob = scope.launch {
                while (isActive) {
                    delay(HEALTH_CHECK_MS.milliseconds)
                    val dropped = SCXMLEventBus.getStatus().dropped()
                    if (dropped > previousDropped) {
                        broadcast(incompleteNotification(dropped - previousDropped))
                    }
                    previousDropped = dropped
                }
            }
        } catch (failure: Throwable) {
            SCXMLEventBus.removeListener(busListener)
            started.set(false)
            throw failure
        }
    }

    /** Ktor owns the session; the bus worker never performs socket I/O. */
    suspend fun handle(session: DefaultWebSocketServerSession) {
        if (!started.get() || closed.get()) {
            session.close(CloseReason(CloseReason.Codes.GOING_AWAY, "Server unavailable"))
            return
        }

        val client = Client(session)
        val writer = scope.launch(start = CoroutineStart.LAZY) {
            try {
                for (payload in client.queue) session.send(Frame.Text(payload))
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                log.debug("Runtime WebSocket sender disconnected", failure)
                clients.remove(client)
                scope.launch {
                    try {
                        withTimeoutOrNull(CLOSE_TIMEOUT_MS.milliseconds) {
                            session.close(CloseReason(CloseReason.Codes.GOING_AWAY, "Connection lost"))
                        }
                    } catch (failure: Exception) {
                        log.debug("Could not close failed runtime WebSocket", failure)
                    }
                }
            }
        }
        client.writer = writer
        clients.add(client)
        writer.start()

        try {
            // Read to observe disconnects. Incoming messages are intentionally not commands.
            for (ignored in session.incoming) { }
        } finally {
            clients.remove(client)
            client.queue.cancel()
            writer.cancel()
        }
    }

    /** Called when the Ktor owner shuts down or fails to start. */
    fun stop() {
        if (!closed.compareAndSet(false, true)) return
        SCXMLEventBus.removeListener(busListener)
        healthJob?.cancel()
        clients.toList().forEach { client ->
            clients.remove(client)
            client.queue.cancel()
            client.writer.cancel()
        }
        scope.cancel()
    }

    private fun broadcast(payload: String) {
        for (client in clients) {
            if (client.queue.trySend(payload).isFailure && clients.remove(client)) {
                // Do not close sockets on the SCXMLEventBus dispatch thread.
                scope.launch {
                    client.queue.cancel()
                    client.writer.cancel()
                    try {
                        withTimeoutOrNull(CLOSE_TIMEOUT_MS.milliseconds) {
                            client.session.close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Runtime event queue overflow"))
                        }
                    } catch (failure: Exception) {
                        log.debug("Could not close overflowing runtime WebSocket", failure)
                    }
                }
            }
        }
    }

    private class Client(val session: DefaultWebSocketServerSession) {
        val queue = Channel<String>(CLIENT_QUEUE_CAPACITY)
        lateinit var writer: Job
    }

    companion object {
        private const val CLIENT_QUEUE_CAPACITY = 256
        private const val HEALTH_CHECK_MS = 1_000L
        private const val CLOSE_TIMEOUT_MS = 2_000L

        /** Fields are exactly those of the engine's SCXMLEvent record; no web event DTO. */
        internal fun serialize(event: SCXMLEvent): String = buildJsonObject {
            put("type", event.type())
            put("timestamp", event.timestamp().toString())
            put("details", JsonObject(event.details().mapValues { JsonPrimitive(it.value) }))
            put("sequence", event.sequence())
            put("values", JsonObject(event.values().mapValues { JsonPrimitive(it.value) }))
        }.toString()

        internal fun incompleteNotification(newlyDropped: Long): String = buildJsonObject {
            put("type", "stream_incomplete")
            put("dropped", newlyDropped)
        }.toString()
    }
}
