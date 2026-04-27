package de.unibi.citec.clf.bonsai.engine

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer
import de.unibi.citec.clf.bonsai.engine.communication.web.WebServer
import de.unibi.citec.clf.bonsai.engine.communication.web.model.*
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.StateID
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.html.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.util.*
import kotlinx.html.a
import kotlinx.html.body
import kotlinx.html.br
import kotlinx.html.code
import kotlinx.html.h1
import kotlinx.html.li
import kotlinx.html.p
import kotlinx.html.ul
import org.apache.log4j.Logger
import org.kohsuke.args4j.Option
import org.reflections.Reflections
import java.io.File
import kotlin.io.encoding.Base64
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

/**
 * Starts the state machine.
 *
 * @author lruegeme
 */
class SCXMLStarterWeb : SCXMLStarter() {

    val reflections = Reflections(SKILL_PREFIX)
    val allClasses: Set<Class<out AbstractSkill>> = reflections.getSubTypesOf(AbstractSkill::class.java)
    val allClassMap: Map<String, Class<out AbstractSkill>> = allClasses.associateBy { it.name }

    @Option(name = "-p", aliases = ["--port"], metaVar = "VALUE", usage = "port to listen")
    private var port: Int = 8080

    @Option(name = "-h", aliases = ["--host"], metaVar = "VALUE", usage = "ip address to listen")
    private var host: String = "localhost"

    override fun createServer(): SCXMLServer {
        val srv = WebServer()
        srv.setController(stateMachineController)

        val server = embeddedServer(Netty, port, host) {
            install(ContentNegotiation) {
                json()
            }
            routing {
                get("/") {
                    call.respondHtml(HttpStatusCode.OK) {
                        head {}
                        body {
                            h1 { +"Bonsai Web is Running" }
                            p {
                                +"Tests:"
                            }
                            ul {
                                li { a("/status") { +"Get Current Status" } }
                                li { a("/skills") { +"Show all Skills" } }
                                li { a("/skill/dialog.Talk") { +"Get dialog.Talk" } }
                                li { a("/skill/dialog.nlu.CheckIntent") { +"Get dialog.nlu.CheckIntent" } }
                                li {
                                    +"Use this to test with parameters #_INTENTS='Foo;Bar':"
                                    br
                                    code {
                                        +"""curl -s -X POST http://localhost:8080/skill/dialog.nlu.CheckIntent -H 'Content-Type: application/json' -d '{"params":{"#_INTENTS":"Foo;Bar"}}'"""
                                    }
                                    br
                                }
                                li {
                                    a("/debug") { +"Get base64 encoded statemachine config JSON for testing, use this to load:" }
                                    br
                                    code {
                                        +"""curl -s -X POST http://localhost:8080/load -H 'Content-Type: application/json' -d 'JSON'"""
                                    }
                                }

                            }
                        }
                    }
                }
                get("/status") {
                    call.respondText("${skillStateMachine.statemachineStatus}", ContentType.Text.Html)
                }
                get("/skills") {
                    val skills = SkillNames(allClasses.map { it.name })
                    call.respond(skills)
                }
                get("/skill/{id}") {
                    val id: String by call.parameters
                    val skill = getSkill(id)
                    if (skill != null) {
                        call.respond(skill)
                    } else {
                        call.respond(HttpStatusCode.NotFound)
                    }

                }
                post("/skill/{id}") {
                    logger.debug("POST /skill")
                    val id: String by call.parameters
                    val params = call.receive<ParameterMap>()
                    val skill = getSkill(id, params.params)
                    if (skill != null) {
                        call.respond(skill)
                    } else {
                        call.respond(HttpStatusCode.NotFound)
                    }
                }
                get("/debug") {
                    val config = """
                        <?xml version="1.0" encoding="utf-8"?>

                        <BonsaiConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                                             xsi:noNamespaceSchemaLocation="BonsaiConfiguration.xsd">

                            <BonsaiOptions>
                                <Option key="CACHE_CONFIG">true</Option>
                            </BonsaiOptions>

                            <FactoryOptions factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory" >
                                <Option key="NODE_INIT_TIMEOUT">1</Option>
                                <Option key="INIT_SLEEP_TIME">1</Option>
                            </FactoryOptions>
                            <FactoryOptions factoryClass="de.unibi.citec.clf.bonsai.memory.MemoryFactory" />

                            <CoordinateTransformer factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory"
                                                   coordinateTransformerClass="de.unibi.citec.clf.bonsai.ros.TFTransformer"
                            />

                            <WorkingMemory key="WorkingMemory"
                                           factoryClass="de.unibi.citec.clf.bonsai.memory.MemoryFactory"
                                           workingMemoryClass="de.unibi.citec.clf.bonsai.memory.DefaultMemory">
                            </WorkingMemory>
                          
                        </BonsaiConfiguration>

                    """.trimIndent()
                    val scxml = """
                        <?xml version="1.0" encoding="UTF-8"?>
                        <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="Nothing">
                            <datamodel>
                                <data id="#_STATE_PREFIX" expr="'de.unibi.citec.clf.bonsai.skills.example.'"/>
                            </datamodel>

                            <state id="Nothing">
                                <transition event="Nothing.fatal" target=""/>
                            </state>

                        </scxml>

                    """.trimIndent()
                    val p1 = BonsaiScxml(Base64.encode(scxml.toByteArray()))
                    val p2 = BonsaiConfig(Base64.encode(config.toByteArray()))
                    val ret = StatemachineConfig(p1,p2,true)
                    call.respond(ret)
                }
                post("/load" ) {
                    logger.debug("POST /load")
                    val params = call.receive<StatemachineConfig>()
                    call.respond(loadStatemachine(params))
                }
            }
        }
        server.start(wait = true)

        logger.info("Web server started")

        return srv
    }

    @OptIn(ExperimentalTime::class)
    private fun loadStatemachine(cfg: StatemachineConfig): LoadingResult {
        val timestamp = Clock.System.now().toEpochMilliseconds()

        if (cfg.statemachine.encoding != "base64") throw Exception("encoding mismatch")
        val scxml = Base64.decode(cfg.statemachine.scxml.encodeToByteArray())
        val scxmlFile = File("/tmp/scxml_$timestamp.xml")
        scxmlFile.writeBytes(scxml)

        if (cfg.config.encoding != "base64") throw Exception("encoding mismatch")
        val config = Base64.decode(cfg.config.xml.encodeToByteArray())
        val configFile = File("/tmp/config_$timestamp.xml")
        configFile.writeBytes(config)

        val msg = mutableListOf<String>()
        var success = false
        try {
            val results = skillStateMachine.initalize(scxmlFile.absolutePath,configFile.absolutePath,cfg.forceLoad)
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

    private fun getSkill(id: String, vars: Map<String, String> = mapOf()): SkillInfo? {
        logger.debug("getSkill $id")
        val mid = if (id.startsWith(SKILL_PREFIX)) id else "${SKILL_PREFIX}.${id}"
        logger.debug("Getting real skill $mid")
        val cls = allClassMap[mid] ?: run {
            logger.error("Skill $mid does not exist")
            logger.error("known skills: ${allClassMap.keys}")
            return null
        }
        val runner = SkillRunner(StateID(mid), vars)
        try {
            runner.tryConfigure()
        } catch (e: NotImplementedError) {
            throw Exception(e)
        }
        val inSlots = runner.inspectionGetInSlots().map { SkillSlot(it.key, it.value.simpleName) }
        val outSlots = runner.inspectionGetOutSlots().map { SkillSlot(it.key, it.value.simpleName) }
        val transitions = runner.inspectionGetRequestedTokens().map { SkillTransition(it.exitStatus.fullStatus) }
        val params = mutableListOf<SkillParameter>()
        params.addAll(runner.inspectionGetRequiredParams().map { SkillParameter(it.key, true) })
        params.addAll(runner.inspectionGetAllOptionalParams().map { SkillParameter(it.key, false) })
        return SkillInfo(mid, inSlots, outSlots, params, transitions)
    }

    companion object {
        const val SKILL_PREFIX = "de.unibi.citec.clf.bonsai.skills"
        val logger: Logger = Logger.getLogger(SCXMLStarterWeb::class.java)


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
