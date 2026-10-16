package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.monitoring.events.slots.SlotEvents
import de.unibi.citec.clf.bonsai.engine.events.ScxmlEvents
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RuntimeEventMapperTest {
    @Test
    fun retainsLegacyEventNamesAndDetails() {
        val cases = mapOf(
            ScxmlEvents.transition("A", "B", "done") to ("transition" to mapOf("source" to "A", "target" to "B", "event" to "done")),
            ScxmlEvents.stateEntered("A") to ("state_entered" to mapOf("state" to "A")),
            ScxmlEvents.stateExited("A") to ("state_exited" to mapOf("state" to "A")),
            ScxmlEvents.terminal("End") to ("terminal" to mapOf("state" to "End")),
            ScxmlEvents.sendRequested("send-7", "#_internal", "scxml", "Pick.done", "cup", 250L) to ("send_requested" to mapOf("id" to "send-7", "target" to "#_internal", "targetType" to "scxml", "event" to "Pick.done", "data" to "cup", "delayMs" to "250")),
            ScxmlEvents.assignment("PickObject", "counter", "counter + 1", "2") to ("datamodel_assignment" to mapOf("sourceState" to "PickObject", "location" to "counter", "expression" to "counter + 1", "value" to "2", "newValue" to "2", "oldValueKnown" to "false", "oldValuePresent" to "false")),
            ScxmlEvents.parameterResolved("#_TARGET", "cup", "@target", "PickObject") to ("parameter" to mapOf("name" to "#_TARGET", "value" to "cup", "newValue" to "cup", "oldValueKnown" to "false", "expression" to "@target", "state" to "PickObject")),
            ScxmlEvents.externalParameter("counter", "42") to ("parameter" to mapOf("name" to "counter", "value" to "42", "newValue" to "42", "oldValueKnown" to "false", "source" to "external")),
            ScxmlEvents.status("RUNNING") to ("status" to mapOf("value" to "RUNNING")),
            ScxmlEvents.stopped() to ("stopped" to emptyMap()),
            SlotEvents.written("slot", "String", "cup") to ("slot_written" to mapOf("slot" to "slot", "dataType" to "String", "value" to "cup", "newValue" to "cup", "oldValueKnown" to "false")),
            SlotEvents.cleared("slot", "String") to ("slot_cleared" to mapOf("slot" to "slot", "dataType" to "String", "value" to "", "newValue" to "", "oldValueKnown" to "false"))
        )
        cases.forEach { (event, expected) ->
            val message = RuntimeEventMapper.toMessage(event)!!
            assertEquals(expected.first, message.type)
            assertEquals(expected.second, message.details)
            assertEquals(event.timestamp().toString(), message.timestamp)
        }
    }

    @Test
    fun sendWithoutOptionalAttributesStillReportsTheRequest() {
        val message = RuntimeEventMapper.toMessage(
            ScxmlEvents.sendRequested(null, null, "scxml", "done", null, 0))!!
        assertEquals("send_requested", message.type)
        assertEquals(mapOf("targetType" to "scxml", "event" to "done", "delayMs" to "0"), message.details)
    }

    @Test
    fun assignmentsWithoutExprDoNotInventAnExpression() {
        val message = RuntimeEventMapper.toMessage(
            ScxmlEvents.assignment("Pick", "target", null, "<xml/>"))!!
        assertEquals("datamodel_assignment", message.type)
        assertFalse(message.details.containsKey("expression"))
    }

    @Test
    fun snapshotsAndEventsAreDistinctMessages() {
        val snapshot = RuntimeSnapshotMessage(
            type = "snapshot",
            timestamp = "2026-10-10T00:00:00Z",
            details = mapOf("status" to "RUNNING"),
            states = listOf("Pick"),
            datamodel = mapOf("global" to mapOf("counter" to "1"))
        )
        val snapshotJson = Json.encodeToString(snapshot)
        assertTrue(snapshotJson.contains("\"type\":\"snapshot\""))
        assertTrue(snapshotJson.contains("\"states\""))
        assertTrue(snapshotJson.contains("\"datamodel\""))
        val eventJson = Json.encodeToString(RuntimeEventMapper.toMessage(ScxmlEvents.status("RUNNING"))!!)
        assertFalse(eventJson.contains("\"states\""))
        assertFalse(eventJson.contains("\"datamodel\""))
    }
}
