package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.engine.SCXMLStarterWeb.Companion.logger
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServerWithControl
import de.unibi.citec.clf.bonsai.engine.communication.StatemachineStatus
import de.unibi.citec.clf.bonsai.engine.communication.web.model.LoadData
import de.unibi.citec.clf.bonsai.engine.communication.web.model.LoadingResult
import de.unibi.citec.clf.bonsai.engine.communication.web.model.StateIds
import de.unibi.citec.clf.bonsai.engine.communication.web.model.Transitions
import de.unibi.citec.clf.bonsai.engine.control.StateMachineController
import de.unibi.citec.clf.bonsai.engine.scxml.BonsaiTransition
import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEvent
import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEventBus
import de.unibi.citec.clf.bonsai.monitoring.logging.RuntimeLog
import de.unibi.citec.clf.bonsai.monitoring.logging.RuntimeLogBus
import kotlinx.coroutines.channels.Channel
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.function.Consumer
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancelAndJoin
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Instant
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import org.apache.log4j.Logger


/**
 * @author lruegeme
 */
class WebServer : SCXMLServerWithControl {
    private var smc: StateMachineController? = null
    private val runtimeEvents = RuntimeEventStream()
    private val runtimeListener = Consumer<BonsaiEvent> { runtimeEvents.publish(it) }

    fun subscribeEvents(afterSequence: Long? = null, runId: String? = null): RuntimeEventStream.Subscription =
        runtimeEvents.subscribe(afterSequence, runId)
    fun unsubscribeEvents(subscription: RuntimeEventStream.Subscription) = runtimeEvents.unsubscribe(subscription)
    fun streamControl(type: String, reason: String? = null): RuntimeStreamControl = runtimeEvents.control(type, reason)

    fun currentSnapshot(): RuntimeSnapshotMessage {
        val controller = smc
        return RuntimeSnapshotMessage(
            type = "snapshot",
            timestamp = Instant.now().toString(),
            details = mapOf("status" to (controller?.status?.name ?: "UNKNOWN")),
            states = controller?.getCurrentStateList(true)?.toList() ?: emptyList(),
            datamodel = controller?.getDatamodelSnapshot() ?: emptyMap()
        )
    }

    override fun setController(stateMachineController: StateMachineController?) {
        // A single process-wide listener receives transitions, data-model and slot events.
        // Re-registering is safe when the controller is replaced by the launcher.
        BonsaiEventBus.unsubscribe(runtimeListener)
        smc = stateMachineController
        if (stateMachineController != null) {
            BonsaiEventBus.subscribe(runtimeListener)
        }
    }

    override fun shutdown() {
        logger.info("Shutting down WebServer")
        BonsaiEventBus.unsubscribe(runtimeListener)
        smc = null
        runtimeEvents.close()
    }

    override fun sendStatesWithTransitions(): Boolean {
        return true
    }

    override fun sendCurrentStates(states: MutableList<String?>?) {
        logger.debug("Sending current states")
    }

    override fun sendCurrentStatesAndTransitions(
        states: MutableList<String?>?,
        transitions: MutableList<BonsaiTransition?>?
    ) {
        logger.debug("Sending current states and transitions")
    }

    override fun sendStatus(status: StatemachineStatus?) {
        logger.debug("Sending current status")
    }

    companion object {
        private val logger: Logger = Logger.getLogger(WebServer::class.java)
    }

    fun fireEvent(event: String) {
        smc!!.fireEvent(event)
    }

    fun getCurrentStates(): StateIds {
        return StateIds(smc!!.currentStateList)
    }

    fun getStateIds(): StateIds {
        return StateIds(smc!!.allStateIds)
    }

    fun getTransitions(): Transitions {
        return Transitions(smc!!.possibleTransitions.map { it.event })
    }

    fun pause() {
        smc!!.pauseStateMachine()
    }

    fun resume() {
        smc!!.continueStateMachine()
    }

    fun start(state: String) {
        smc!!.executeStateMachine(state)
    }

    fun stop() {
        smc!!.stopStateMachine()
    }

    fun stopAutomaticEvents(b: Boolean) {
        smc!!.enableAutomaticEvents(b)
    }

    fun load(loadData: LoadData
    ): LoadingResult {
        val msg = mutableListOf<String>()
        var success = false
        try {
            val results = smc!!.load(loadData.pathToConfig, loadData.pathToTask, loadData.forceConfigure)
            success = results.success()
            msg.addAll(results.loadingExceptions.map { it.message.toString() })
            msg.addAll(results.validationResult.stateNotFoundException.map { it.message.toString() })
            msg.addAll(results.validationResult.transitionNotFoundException.map { it.message })

            logger.info("ConfigurationResults:\n${results.configurationResults}")
            logger.info("ValidationResults:\n${results.validationResult}")
            logger.info("stateMachineResults:\n${results.stateMachineResults}")

        } catch (e: Exception) {
            msg.add(e.message.toString())
        }

        return LoadingResult(success, msg)
    }

}

fun Route.serverRoutes(server: WebServer) {
    route("/bonsai") {
        // WebSocket supports replay from a known sequence. With no `since`,
        // replay from the beginning of the bounded server-side history.
        webSocket("/ws") {
            val sinceParam = call.request.queryParameters["since"]
            val since = sinceParam?.toLongOrNull() ?: 0L
            if ((sinceParam != null && sinceParam.toLongOrNull() == null) || since < 0) {
                send(Frame.Text(Json.encodeToString(server.streamControl("error", "Invalid since"))))
                close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Invalid since"))
                return@webSocket
            }
            val subscription = server.subscribeEvents(since, call.request.queryParameters["runId"])
            try {
                if (subscription.gap) {
                    send(Frame.Text(Json.encodeToString(server.streamControl(
                        "resync_required", "Requested history is unavailable or belongs to another server run"))))
                    close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Resync required"))
                    return@webSocket
                }
                send(Frame.Text(Json.encodeToString(RuntimeStreamControl(
                    "hello", subscription.runId, subscription.sequence, subscription.earliestSequence))))
                // Replay is captured atomically with subscription; queued live events
                // cannot overtake it even if the state machine is executing rapidly.
                for (message in subscription.replay) {
                    send(Frame.Text(Json.encodeToString(message)))
                }
                // Detect a closed browser even while waiting for the next event.
                val reader = launch {
                    try { for (ignored in incoming) { /* client messages not required */ } }
                    finally { server.unsubscribeEvents(subscription) }
                }
                try {
                    for (message in subscription.channel!!) {
                        send(Frame.Text(Json.encodeToString(message)))
                    }
                } catch (overflow: RuntimeStreamOverflow) {
                    send(Frame.Text(Json.encodeToString(server.streamControl(
                        "resync_required", "Client could not keep up with events"))))
                    close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Replay required"))
                } finally {
                    reader.cancelAndJoin()
                }
            } finally {
                server.unsubscribeEvents(subscription)
            }
        }
        webSocket("/logs/ws") {
            val logs = Channel<RuntimeLog>(256)

            val listener = Consumer<RuntimeLog> { log ->
                logs.trySend(log)
                Unit
            }

            RuntimeLogBus.subscribe(listener)

            val reader = launch {
                try {
                    for (ignored in incoming) {
                        // No client messages required.
                    }
                } finally {
                    logs.close()
                }
            }

            try {
                for (log in logs) {
                    val message = buildJsonObject {
                        put("type", "runtime_log")
                        put("timestamp", log.timestamp())
                        put("level", log.level())
                        put("logger", log.logger())
                        put("thread", log.thread())
                        put("message", log.message())
                        put("exception", log.exception())
                    }

                    send(Frame.Text(message.toString()))
                }
            } finally {
                RuntimeLogBus.unsubscribe(listener)
                logs.close()
                reader.cancelAndJoin()
            }
        }
        // Existing SSE clients continue to work; no polling is required.
        get("/events") {
            call.response.header(HttpHeaders.CacheControl, "no-cache, no-transform")
            call.response.header("X-Accel-Buffering", "no")
            val lastId = call.request.headers["Last-Event-ID"]?.toLongOrNull()
            val subscription = server.subscribeEvents(lastId)
            call.respondTextWriter(contentType = ContentType.parse("text/event-stream")) {
                try {
                    if (subscription.gap) {
                        write("event: resync_required\ndata: ${Json.encodeToString(server.streamControl("resync_required", "Event history expired"))}\n\n")
                        flush()
                        return@respondTextWriter
                    }
                    if (lastId == null) {
                        write("data: ${Json.encodeToString(server.currentSnapshot())}\n\n")
                        flush()
                    }
                    for (message in subscription.replay) {
                        write("id: ${message.sequence}\ndata: ${Json.encodeToString(message)}\n\n")
                    }
                    flush()
                    while (true) {
                        val message = try {
                            withTimeoutOrNull(15_000L) { subscription.channel!!.receive() }
                        } catch (overflow: RuntimeStreamOverflow) {
                            write("event: resync_required\ndata: ${Json.encodeToString(server.streamControl("resync_required", "Client could not keep up"))}\n\n")
                            flush()
                            break
                        }
                        if (message == null) {
                            write(": heartbeat\n\n")
                        } else {
                            write("id: ${message.sequence}\ndata: ${Json.encodeToString(message)}\n\n")
                        }
                        flush()
                    }
                } finally {
                    server.unsubscribeEvents(subscription)
                }
            }
        }
        get("/snapshot") { call.respond(server.currentSnapshot()) }
        post("/load") {
            logger.debug("POST /load")
            val params = call.receive<LoadData>()
            call.respond(server.load(params))
        }
        get("/transitions") {
            call.respond(server.getTransitions())
        }
        get("/all_states") {
            call.respond(server.getStateIds())
        }
        get("/states") {
            call.respond(server.getCurrentStates())
        }
        post("/stop") {
            server.stop()
            call.respond(HttpStatusCode.OK)
        }
        post("/start") {
            val payload = call.receiveText()
            server.start(payload)
            call.respond(HttpStatusCode.OK)
        }
        post("/fire_event") {
            val payload = call.receiveText()
            server.fireEvent(payload)
            call.respond(HttpStatusCode.OK)
        }
        post("/stop_events") {
            val payload : Boolean = call.receive<Boolean>()
            server.stopAutomaticEvents(payload)
            call.respond(HttpStatusCode.OK)
        }
        post("/pause") {
            server.pause()
            call.respond(HttpStatusCode.OK)
        }
        post("/resume") {
            server.resume()
            call.respond(HttpStatusCode.OK)
        }
    }
}
