package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.engine.communication.RuntimeChanges
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.assertFalse

class RuntimeEventMapperTest {
    @Test fun forwardsFlatRuntimeChangeWithoutRenamingFields() {
        val event = RuntimeChanges.transition("A", "B", "next")
        val wire = RuntimeEventMapper.toMessage(event)
        assertEquals("transition", wire.type)
        assertEquals("A", wire.details["source"])
        assertEquals("B", wire.details["target"])
        assertEquals("next", wire.details["event"])
    }
    @Test fun snapshotContainsSlotsAndScopedVariables() {
        val msg = RuntimeEventMessage("snapshot", "2026-10-17T00:00:00Z",
            mapOf("status" to "RUNNING"),
            states = listOf("A"), datamodel = mapOf("global" to mapOf("x" to "1")),
            slots = mapOf("/goal" to mapOf("value" to "{\"x\":2}", "valueEncoding" to "json")))
        val json = Json.encodeToString(msg)
        assertTrue(json.contains("\"slots\""))
        assertTrue(json.contains("\"datamodel\""))
        assertFalse(Json.encodeToString(RuntimeEventMapper.toMessage(RuntimeChanges.status("RUNNING"))).contains("\"slots\""))
    }
}
