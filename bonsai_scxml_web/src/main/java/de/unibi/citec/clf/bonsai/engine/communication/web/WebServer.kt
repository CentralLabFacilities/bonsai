package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.engine.communication.web.model.LoadData
import de.unibi.citec.clf.bonsai.engine.communication.web.model.LoadingResult
import de.unibi.citec.clf.bonsai.engine.communication.web.model.StateIds
import de.unibi.citec.clf.bonsai.engine.communication.web.model.Transitions
import de.unibi.citec.clf.bonsai.engine.control.StateMachineController
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.apache.log4j.Logger


/**
 * @author lruegeme
 */
class WebServer(private val smc: StateMachineController) {

    companion object {
        private val logger: Logger = Logger.getLogger(WebServer::class.java)
    }

    fun fireEvent(event: String) {
        smc.fireEvent(event)
    }

    fun getCurrentStates(all: Boolean = false): StateIds {
        return StateIds(smc.getCurrentStateList(all))
    }

    fun getStateIds(): StateIds {
        return StateIds(smc.allStateIds)
    }

    fun getTransitions(): Transitions {
        return Transitions(smc.possibleTransitions.map { it.event })
    }

    fun pause() {
        smc.pauseStateMachine()
    }

    fun resume() {
        smc.continueStateMachine()
    }

    fun start(state: String) {
        smc.executeStateMachine(state)
    }

    fun stop() {
        smc.stopStateMachine()
    }

    fun stopAutomaticEvents(b: Boolean) {
        smc.enableAutomaticEvents(b)
    }

    fun load(loadData: LoadData
    ): LoadingResult {
        val msg = mutableListOf<String>()
        var success = false
        try {
            val results = smc.load(loadData.pathToConfig, loadData.pathToTask, loadData.forceConfigure)
            success = results.success()
            msg.addAll(results.loadingExceptions.map { it.message.toString() })
            msg.addAll(results.validationResult.stateNotFoundException.map { it.message.toString() })
            msg.addAll(results.validationResult.transitionNotFoundException.map { it.message })
            msg.addAll(results.configurationResults.configurationExceptions.map {it.message.toString()})
            msg.addAll(listOf(results.stateMachineResults.toString(true)))

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
            val all = call.request.queryParameters["all"] == "true"
            call.respond(server.getCurrentStates(all))
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
