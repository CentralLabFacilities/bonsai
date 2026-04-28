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
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.apache.log4j.Logger


/**
 * @author lruegeme
 */
class WebServer : SCXMLServerWithControl {
    private var smc: StateMachineController? = null

    override fun setController(stateMachineController: StateMachineController?) {
        this.smc = stateMachineController
    }

    override fun shutdown() {
        logger.info("Shutting down WebServer")
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
