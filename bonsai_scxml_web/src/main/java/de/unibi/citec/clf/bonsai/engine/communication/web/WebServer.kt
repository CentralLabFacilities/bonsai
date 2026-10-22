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
import de.unibi.citec.clf.bonsai.engine.communication.RuntimeChanges.RuntimeChange
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

    fun subscribeEvents(): RuntimeEventStream.Subscription = runtimeEvents.subscribe()

    fun unsubscribeEvents(subscription: RuntimeEventStream.Subscription) = runtimeEvents.unsubscribe(subscription)

    override fun setController(stateMachineController: StateMachineController?) {
        smc?.removeRuntimeListener(runtimeListener)
        this.smc = stateMachineController
        smc?.addRuntimeListener(runtimeListener)
    }

    override fun shutdown() {
        logger.info("Shutting down WebServer")
        smc?.removeRuntimeListener(runtimeListener)
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
        get("/datamodel") { call.respond(server.getDatamodelSnapshot()) }
        get("/status") { call.respondText(server.getStatus().name, ContentType.Text.Plain) }
        post("/params") {
            server.setParams(call.receive<Map<String, String>>())
            call.respond(HttpStatusCode.OK)
        }
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
