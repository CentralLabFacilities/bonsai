package de.unibi.citec.clf.bonsai.engine.communication.web

import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import io.ktor.server.application.*

import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.apache.log4j.AppenderSkeleton
import org.apache.log4j.helpers.LogLog
import org.apache.log4j.spi.LoggingEvent
import java.net.URI
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.BlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.NettyApplicationEngine
import io.ktor.server.netty.Netty
import io.ktor.server.response.respondText
import kotlin.time.Duration.Companion.milliseconds

/**
 * Log4j 1.x appender with an embedded Ktor Netty WebSocket server.
 *
 * Default endpoint: ws://127.0.0.1:8765/bonsai/logs
 */
class WebConsoleLogAppender : AppenderSkeleton() {

    var host: String = "127.0.0.1"
    var port: Int = 8765
    var path: String = "/bonsai/logs"
    var capacity: Int = 2048
    var clientQueueCapacity: Int = 128
    var maxClients: Int = 8

    private data class LogEntry(
        val timestamp: Long,
        val level: String,
        val logger: String,
        val message: String,
        val stackTrace: String?
    )

    private class SlowClient : RuntimeException("Log WebSocket client queue overflow")

    private class Client(val id: Long, capacity: Int) {
        val messages = Channel<String>(capacity)
    }

    private val started = AtomicBoolean(false)
    private val stopping = AtomicBoolean(false)
    private val nextClientId = AtomicLong(0)
    private val clients = ConcurrentHashMap<Long, Client>()
    private val clientRegistration = Any()

    private val dropped = AtomicLong(0)
    private val slowClients = AtomicLong(0)
    private val failures = AtomicLong(0)

    @Volatile private var queue: BlockingQueue<LogEntry>? = null
    @Volatile private var worker: Thread? = null
    @Volatile private var server: EmbeddedServer<NettyApplicationEngine, NettyApplicationEngine.Configuration>? = null
    @Volatile private var active: Boolean = false

    init {
        setName("WEB_CONSOLE")
    }

    /** Called by Log4j PropertyConfigurator after assigning the properties. */
    override fun activateOptions() {
        if (stopping.get()) throw IllegalStateException("Appender has been closed")
        require(port in 1..65535) { "Invalid WebSocket port" }
        require(host.isNotBlank()) { "Host must not be blank" }
        require(path.startsWith('/') && !path.contains('?') && !path.contains('#')) {
            "Path must be an absolute URL path without query or fragment"
        }
        require(capacity > 0 && clientQueueCapacity > 0 && maxClients > 0) {
            "Queue capacities and maxClients must be positive"
        }

        if (!started.compareAndSet(false, true)) return

        val pending = ArrayBlockingQueue<LogEntry>(capacity)
        var localEngine: EmbeddedServer<NettyApplicationEngine, NettyApplicationEngine.Configuration>? = null
        try {
            // Entirely separate listener and routing tree; no WebServer registration.
            localEngine = embeddedServer(Netty, host = host, port = port) {
                install(WebSockets)
                routing {
                    System.out.println("Registering log WebSocket at: ${this@WebConsoleLogAppender.path}")
                    webSocket(this@WebConsoleLogAppender.path) {
                        val origin = call.request.headers[io.ktor.http.HttpHeaders.Origin]
                        if (!isAllowedOrigin(origin)) {
                            close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Origin not allowed"))
                            return@webSocket
                        }
                        val client = subscribe()
                        if (client == null) {
                            close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Too many log viewers"))
                            return@webSocket
                        }

                        // Separate receiver so closing the browser ends the subscription.
                        val reader = launch {
                            try {
                                for (ignored in incoming) { /* read-only endpoint */ }
                            } finally {
                                client.messages.close()
                            }
                        }
                        try {
                            for (json in client.messages) {
                                withTimeout(5_000L.milliseconds) {
                                    send(Frame.Text(json))
                                    flush()
                                }
                            }
                        } catch (_: SlowClient) {
                            close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Log queue overflow"))
                        } catch (_: TimeoutCancellationException) {
                            close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Slow log viewer"))
                        } finally {
                            unsubscribe(client)
                            reader.cancel()
                        }
                    }
                }
            }
            localEngine.start(wait = false)

            if (stopping.get()) {
                localEngine.stop(0, 1_000)
                return
            }
            queue = pending
            server = localEngine
            active = true
            worker = Thread({ distribute(pending) }, "bonsai-web-console-dispatch").apply {
                isDaemon = true
                start()
            }
        } catch (failure: Exception) {
            active = false
            queue = null
            try { localEngine?.stop(0, 1_000) } catch (_: Exception) { /* failed start */ }
            started.set(false)
            LogLog.error("Unable to start Ktor log WebSocket on $host:$port", failure)
            throw IllegalStateException("Unable to start Ktor log WebSocket on $host:$port", failure)
        }
    }

    /** Invoked synchronously by Log4j; network and JSON work happen elsewhere. */
    override fun append(event: LoggingEvent) {
        val pending = queue ?: return
        if (!active || stopping.get() || clients.isEmpty()) return

        val entry = LogEntry(
            timestamp = event.timeStamp,
            level = event.level.toString(),
            logger = event.loggerName ?: "",
            message = event.renderedMessage ?: "",
            stackTrace = event.throwableStrRep?.joinToString("\n")
        )
        if (!pending.offer(entry)) dropped.incrementAndGet()
    }

    private fun distribute(pending: BlockingQueue<LogEntry>) {
        try {
            while (active && !Thread.currentThread().isInterrupted) {
                val entry = pending.take()
                if (clients.isEmpty()) continue
                try {
                    val json = buildJsonObject {
                        put("timestamp", entry.timestamp)
                        put("level", entry.level)
                        put("logger", entry.logger)
                        put("message", entry.message)
                        if (entry.stackTrace == null) put("stackTrace", JsonNull)
                        else put("stackTrace", entry.stackTrace)
                    }.toString()

                    // Each slow client is disconnected independently. No suspended
                    // writes and no unbounded per-client buffering on this thread.
                    for (client in clients.values) {
                        if (client.messages.trySend(json).isFailure &&
                            clients.remove(client.id, client)) {
                            slowClients.incrementAndGet()
                            client.messages.close(SlowClient())
                        }
                    }
                } catch (_: Exception) {
                    // Never log here: recursive logging could overload the queue.
                    failures.incrementAndGet()
                }
            }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    private fun subscribe(): Client? = synchronized(clientRegistration) {
        if (!active || stopping.get() || clients.size >= maxClients) return@synchronized null
        Client(nextClientId.incrementAndGet(), clientQueueCapacity).also {
            clients[it.id] = it
        }
    }

    private fun unsubscribe(client: Client) {
        clients.remove(client.id, client)
        client.messages.close()
    }

    /**
     * Reject cross-origin browser connections that could read localhost logs.
     * Native/local WebSocket clients typically have no Origin header.
     */
    private fun isAllowedOrigin(origin: String?): Boolean {
        if (origin == null) return true
        if (origin == "null") return false
        return try {
            when (URI(origin).host?.lowercase()) {
                "localhost", "127.0.0.1", "::1", "[::1]", "tauri.localhost" -> true
                else -> false
            }
        } catch (_: Exception) {
            false
        }
    }

    val droppedCount: Long get() = dropped.get()
    val slowClientCount: Long get() = slowClients.get()
    val failedCount: Long get() = failures.get()
    val clientCount: Int get() = clients.size
    val isRunning: Boolean get() = active

    override fun requiresLayout(): Boolean = false

    override fun close() {
        if (!stopping.compareAndSet(false, true)) return
        active = false
        closed = true
        worker?.interrupt()
        queue?.clear()
        synchronized(clientRegistration) {
            clients.values.forEach { it.messages.close() }
            clients.clear()
        }
        // Don't hold the client lock or AppenderSkeleton monitor while stopping:
        // Ktor/Netty might itself log during shutdown.
        try { server?.stop(500, 2_000) } catch (_: Exception) { /* shutdown */ }
        worker = null
        queue = null
        server = null
    }
}
