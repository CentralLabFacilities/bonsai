package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServerWithControl
import de.unibi.citec.clf.bonsai.engine.communication.StatemachineStatus
import de.unibi.citec.clf.bonsai.engine.communication.web.model.LoadData
import de.unibi.citec.clf.bonsai.engine.communication.web.model.LoadingResult
import de.unibi.citec.clf.bonsai.engine.communication.web.model.StateIds
import de.unibi.citec.clf.bonsai.engine.communication.web.model.Transitions
import de.unibi.citec.clf.bonsai.engine.control.StateMachineController
import de.unibi.citec.clf.bonsai.engine.scxml.BonsaiTransition
import de.unibi.citec.clf.bonsai.engine.communication.RuntimeChanges.RuntimeChange
import de.unibi.citec.clf.bonsai.engine.communication.web.memory.WebMemoryFactory
import de.unibi.citec.clf.bonsai.engine.communication.web.memory.WebSupportMemory
import io.ktor.server.application.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.function.Consumer
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.launch
import kotlinx.coroutines.TimeoutCancellationException
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
    private val recorderLock = Any()
    private var recorder: WebRuntimeRecorder? = WebRuntimeRecorder.open()
    private val runtimeEvents = RuntimeEventStream(onCommitted = {
        synchronized(recorderLock) { recorder?.record(it) }
    })
    private fun publish(message: RuntimeEventMessage) {
        runtimeEvents.publish(message)
    }
    private fun publish(change: RuntimeChange) = publish(
        RuntimeEventMessage(change.type(), change.timestamp().toString(), change.details())
    )
    private val runtimeListener = Consumer<RuntimeChange> { change -> publish(change) }
    private val slotListener = Consumer<WebSupportMemory.SlotChange> { change ->
        publish(RuntimeChange.of(
            when {
                change.registered() -> "slot_registered"
                change.cleared() -> "slot_cleared"
                else -> "slot_written"
            },
            "slot", change.path(), "dataType", change.dataType(),
            "oldValue", change.before(), "newValue", change.after(),
            "value", change.after(), "oldValueKnown", change.beforeKnown().toString(),
            "known", change.known().toString(), "cleared", change.cleared().toString(),
            "valueIsNull", change.valueIsNull().toString(),
            "oldValueIsNull", change.beforeIsNull().toString(), "valueEncoding", "string"))
    }

    private fun slotSnapshot(): Map<String, Map<String, String>> =
        WebMemoryFactory.currentMemory()?.usedSlots?.mapValues { (_, value) ->
            buildMap {
                put("dataType", value.dataType())
                value.value()?.let { put("value", it) }
                put("known", value.known().toString())
                put("cleared", value.cleared().toString())
                put("valueEncoding", "string")
                put("valueIsNull", value.valueIsNull().toString())
            }
        } ?: emptyMap()

    /** Register a live subscriber; the first message is stream_ready, not a snapshot. */
    fun subscribeEvents(): RuntimeEventStream.Subscription = runtimeEvents.subscribe()

    fun unsubscribeEvents(subscription: RuntimeEventStream.Subscription) = runtimeEvents.unsubscribe(subscription)

    override fun setController(stateMachineController: StateMachineController?) {
        smc?.removeRuntimeListener(runtimeListener)
        smc = stateMachineController
        smc?.addRuntimeListener(runtimeListener)
        WebMemoryFactory.setSlotListener(slotListener)
    }

    override fun shutdown() {
        logger.info("Shutting down WebServer")
        smc?.removeRuntimeListener(runtimeListener)
        WebMemoryFactory.setSlotListener(null)
        smc = null
        runtimeEvents.close()
        val old = synchronized(recorderLock) { recorder.also { recorder = null } }
        old?.close()
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

    fun getDatamodelSnapshot(): Map<String, Map<String, String>> =
        smc?.getAllAttributes() ?: emptyMap()

    fun getUsedSlots(): Map<String, Map<String, String>> = slotSnapshot()

    fun getSlotValue(path: String): Map<String, String>? {
        return getUsedSlots()[path]
    }

    fun getStatus(): StatemachineStatus = smc?.status ?: StatemachineStatus.UNKNOWN

    fun setParams(params: Map<String, String>) {
        smc!!.setDatamodelParams(params)
    }

    fun pause() {
        smc!!.pauseStateMachine()
    }

    fun resume() {
        smc!!.continueStateMachine()
    }

    fun start(state: String) {
        val old = synchronized(recorderLock) {
            recorder.also { recorder = WebRuntimeRecorder.open() }
        }
        old?.close()
        // A slot first requested during Load predates the WebSocket subscription.
        // Re-announce its captured value before execution starts, as an event.
        WebMemoryFactory.currentMemory()?.announceUsedSlots()
        smc!!.executeStateMachine(state)
    }

    fun stop() {
        smc!!.stopStateMachine()
    }

    fun stopAutomaticEvents(b: Boolean) {
        // The remote API parameter indicates whether events should be stopped.
        smc!!.enableAutomaticEvents(!b)
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
        // The stream_ready acknowledgement proves subscription is installed before Start.
        webSocket("/ws") {
            val subscription = try { server.subscribeEvents() }
            catch (failure: Exception) {
                close(CloseReason(CloseReason.Codes.INTERNAL_ERROR, "Unable to subscribe to runtime events"))
                return@webSocket
            }
            try {
                // Read incoming controls separately so browser shutdown is noticed.
                val reader = launch {
                    try { for (ignored in incoming) { /* server is read-only */ } }
                    finally { server.unsubscribeEvents(subscription) }
                }
                try {
                    for (message in subscription.channel) {
                        // A client that stalls on a socket write must not retain an
                        // unbounded backlog or delay SCXML execution.
                        withTimeout(5_000L) { send(Frame.Text(Json.encodeToString(message))) }
                    }
                } catch (_: RuntimeStreamOverflow) {
                    close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Event queue overflow"))
                } catch (_: TimeoutCancellationException) {
                    close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Slow WebSocket client"))
                } finally {
                    reader.cancel()
                }
            } finally {
                server.unsubscribeEvents(subscription)
            }
        }
        get("/attributes") { call.respond(server.getDatamodelSnapshot()) }
        get("/slots") { call.respond(server.getUsedSlots()) }
        get("/slots/value") {
            val path = call.request.queryParameters["path"]
            if (path.isNullOrBlank()) {
                call.respond(HttpStatusCode.BadRequest, "Missing slot path")
            } else {
                val value = server.getSlotValue(path)
                if (value == null) call.respond(HttpStatusCode.NotFound)
                else call.respond(value)
            }
        }
        get("/datamodel") { call.respond(server.getDatamodelSnapshot()) }
        get("/status") { call.respondText(server.getStatus().name, ContentType.Text.Plain) }
        post("/params") {
            server.setParams(call.receive<Map<String, String>>())
            call.respond(HttpStatusCode.OK)
        }
        post("/load") {
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
