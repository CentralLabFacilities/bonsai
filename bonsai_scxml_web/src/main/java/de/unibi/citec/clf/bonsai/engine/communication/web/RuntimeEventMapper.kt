package de.unibi.citec.clf.bonsai.engine.communication.web

import de.unibi.citec.clf.bonsai.engine.communication.RuntimeChanges.RuntimeChange

/** SCXML knows nothing about HTTP, JSON, WebSockets or GUI-specific classes. */
internal object RuntimeEventMapper {
    fun toMessage(change: RuntimeChange) = RuntimeEventMessage(
        change.type(), change.timestamp().toString(), change.details()
    )
}
