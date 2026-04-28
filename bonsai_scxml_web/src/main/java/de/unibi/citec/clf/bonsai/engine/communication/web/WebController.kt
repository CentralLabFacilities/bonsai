package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLRemote
import de.unibi.citec.clf.bonsai.engine.communication.web.model.LoadData
import de.unibi.citec.clf.bonsai.engine.communication.web.model.StateIds
import de.unibi.citec.clf.bonsai.engine.communication.web.model.Transitions
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.runBlocking
import org.apache.log4j.Logger


/**
 * @author lruegeme
 */
open class WebController(val host: String, val port: Int) : SCXMLRemote {
    val bonsai : String = "http://$host:$port/bonsai"
    val client : HttpClient = HttpClient() {
        install(ContentNegotiation) {
            json()
        }
    }

    override fun fireEvent(event: String): Boolean {
        runBlocking {
            client.post("$bonsai/fire_event") {
                contentType(ContentType.Application.Json)
                setBody(event)
            }
        }
        return true
    }

    override fun getCurrentStates(): MutableList<String> {
        val response : StateIds = runBlocking {
            client.get("$bonsai/states").body()
        }
        return response.ids as MutableList<String>
    }

    override fun getStateIds(): MutableList<String> {
        val response : StateIds = runBlocking {
            client.get("$bonsai/all_states").body()
        }
        return response.ids as MutableList<String>
    }

    override fun getTransitions(): MutableList<String> {
        val response : Transitions =  runBlocking {
            client.get("$bonsai/transitions").body()
        }
        return response.transitions as MutableList<String>
    }

    override fun load(
        pathToConfig: String,
        pathToTask: String,
        includeMapping: MutableMap<String, String>,
        forceConfigure: Boolean
    ): String {
        val ld = LoadData(pathToConfig, pathToTask, includeMapping, forceConfigure)
        val response =  runBlocking {
            client.post("$bonsai/load") {
                contentType(ContentType.Application.Json)
                setBody(ld)
            }
        }
        return response.toString()
    }

    override fun pause(): Boolean {
        return false
    }

    override fun resume(): Boolean {
        return false
    }

    override fun setParams(map: MutableMap<String, String>?): Boolean {
        return false
    }

    override fun start(): Boolean {
        runBlocking {
            client.post("$bonsai/start")
        }
        return true
    }

    override fun start(state: String): Boolean {
        runBlocking {
            client.post("$bonsai/start") {
                setBody(state)
            }
        }
        return true
    }

    override fun stop(): Boolean {
        runBlocking {
            client.post("$bonsai/stop") {
            }
        }
        return true
    }

    override fun stopAutomaticEvents(b: Boolean): Boolean {
        runBlocking {
            client.post("$bonsai/stop_events") {
                contentType(ContentType.Application.Json)
                setBody(b)
            }
        }
        return true
    }

    override fun exit() {
    }

    companion object {
        private val logger: Logger? = Logger.getLogger(WebController::class.java)
    }
}
