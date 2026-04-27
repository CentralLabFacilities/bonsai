package de.unibi.citec.clf.bonsai.engine

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer
import de.unibi.citec.clf.bonsai.engine.communication.StateChangePublisher
import de.unibi.citec.clf.bonsai.engine.communication.StateChangePublisherWeb
import de.unibi.citec.clf.bonsai.engine.communication.WebServer

import io.ktor.http.ContentType
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import org.kohsuke.args4j.Option

/**
 * Starts the state machine.
 *
 * @author lkettenb
 */
class SCXMLStarterWeb : SCXMLStarter() {

    override fun createServer(): SCXMLServer {
        val srv = WebServer()
        srv.setController(stateMachineController)
        val pub: StateChangePublisher = StateChangePublisherWeb()

        LOG.info("Web server started")

        skillStateMachine.addListener(pub)

        val server = embeddedServer(Netty, 8080) {
            routing {
                get("/status") {
                    call.respondText("${skillStateMachine.statemachineStatus}", ContentType.Text.Html)
                }
            }
        }
        server.start(wait = true)

        return srv
    }

    companion object {
        const val DEFAULT_TOPIC_TRANSITIONS: String = "/bonsai/transitions"
        const val DEFAULT_TOPIC_STATUS: String = "/bonsai/status"
        const val DEFAULT_TOPIC_STATES: String = "/bonsai/states"
        const val DEFAULT_SERVER_TOPIC: String = "/bonsai/server"


        /**
         * Starts the application.
         *
         * @param args Arguments
         */
        @JvmStatic
        fun main(args: Array<String>) {
            val scxmlStarterROS = SCXMLStarterWeb()
            scxmlStarterROS.startup(args)




        }
    }
}
