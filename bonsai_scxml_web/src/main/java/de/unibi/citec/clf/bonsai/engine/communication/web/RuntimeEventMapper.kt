package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEvent
import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEventSerializer
import de.unibi.citec.clf.bonsai.monitoring.events.slots.SlotEvents
import de.unibi.citec.clf.bonsai.engine.events.ScxmlEvents


internal object RuntimeEventMapper {
    fun toMessage(event: BonsaiEvent): RuntimeEventMessage {
        val details: Map<String, String>
        val type: String
        when (event) {
            is SlotEvents.Written -> {
                type = "slot_written"
                details = buildMap {
                    put("slot", event.slot()); put("dataType", event.dataType())
                    put("value", event.value()); put("newValue", event.value())
                    event.oldValue()?.let { put("oldValue", it) }
                }
            }
            is SlotEvents.Cleared -> {
                type = "slot_cleared"
                details = buildMap {
                    put("slot", event.slot()); put("dataType", event.dataType())
                    put("value", ""); put("newValue", "")
                    event.oldValue()?.let { put("oldValue", it) }
                }
            }
            is ScxmlEvents.Transition -> {
                type = "transition"
                details = mapOf("source" to event.source(), "target" to event.target(), "event" to event.event())
            }
            is ScxmlEvents.StateEntered -> {
                type = "state_entered"
                details = mapOf("state" to event.state())
            }
            is ScxmlEvents.StateExited -> {
                type = "state_exited"
                details = mapOf("state" to event.state())
            }
            is ScxmlEvents.TerminalState -> {
                type = "terminal"
                details = mapOf("state" to event.state())
            }
            is ScxmlEvents.Assignment -> {
                type = "datamodel_assignment"
                details = buildMap {
                    put("sourceState", event.sourceState())
                    put("location", event.location())
                    event.expression()?.let { put("expression", it) }
                    put("value", event.value()); put("newValue", event.value())
                    event.oldValue()?.let { put("oldValue", it) }
                    put("oldValueKnown", event.oldValueKnown().toString())
                    put("oldValuePresent", event.oldValuePresent().toString())
                }
            }
            is ScxmlEvents.SendRequested -> {
                type = "send_requested"
                details = buildMap {
                    event.id()?.let { put("id", it) }
                    event.target()?.let { put("target", it) }
                    event.targetType()?.let { put("targetType", it) }
                    event.event()?.let { put("event", it) }
                    event.data()?.let { put("data", it) }
                    put("delayMs", event.delayMillis().toString())
                }
            }
            is ScxmlEvents.ParameterResolved -> {
                type = "parameter"
                details = buildMap {
                    put("name", event.name())
                    put("value", event.value()); put("newValue", event.value())
                    put("oldValueKnown", "false")
                    event.expression()?.let { put("expression", it) }
                    event.state()?.let { put("state", it) }
                    event.source()?.let { put("source", it) }
                }
            }
            is ScxmlEvents.Status -> {
                type = "status"
                details = mapOf("value" to event.value())
            }
            is ScxmlEvents.Stopped -> {
                type = "stopped"
                details = emptyMap()
            }
            else -> {
                type = event.type()
                details = try {
                    mapOf("serializedEvent" to BonsaiEventSerializer.toJson(event))
                } catch (_: RuntimeException) {
                    // Non-record BonsaiEvent implementations still reach the GUI.
                    mapOf("unmappedClass" to event.javaClass.name)
                }
            }
        }
        return RuntimeEventMessage(type, event.timestamp().toString(), details)
    }
}
