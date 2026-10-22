package de.unibi.citec.clf.bonsai.engine.communication.web

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WebControllerRemoteTest {
    @Test
    fun baseScxmlRemoteHasNoInspectionMethods() {
        val names = de.unibi.citec.clf.bonsai.engine.communication.SCXMLRemote::class.java
            .declaredMethods.map { it.name }.toSet()
        assertTrue("getDatamodelSnapshot" !in names)
        assertTrue("getStatus" !in names)
    }

    @Test
    fun setParamsActuallySendsParametersToTheServer() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val observed = AtomicReference<String>()
        server.createContext("/bonsai/params") {
            observed.set(it.requestBody.bufferedReader().use { reader -> reader.readText() })
            respond(it, 200, "")
        }
        server.start()
        val remote = WebController("127.0.0.1", server.address.port)
        try {
            assertTrue(remote.setParams(mutableMapOf("counter" to "42")))
            assertEquals("42", Json.parseToJsonElement(observed.get()).jsonObject["counter"]?.jsonPrimitive?.content)
        } finally {
            remote.client.close()
            server.stop(0)
        }
    }

    private fun respond(exchange: HttpExchange, status: Int, body: String) {
        val bytes = body.toByteArray(StandardCharsets.UTF_8)
        exchange.responseHeaders.set("Content-Type", if (body.startsWith("{")) "application/json" else "text/plain")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }
}
