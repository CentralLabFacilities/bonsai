package de.unibi.citec.clf.bonsai.gui.grapheditor.core.utils

import javafx.event.Event
import javafx.event.EventHandler
import javafx.event.EventType
import javafx.scene.Node

class EventUtils {

    companion object {

        fun <N : Node?, T : Event> removeEventHandlers(
            eventHandlers: MutableMap<N, EventHandler<T>>,
            type: EventType<T>
        ) {
            val iter = eventHandlers.entries.iterator()
            while (iter.hasNext()) {
                val (node, eventHandler) = iter.next()
                node?.removeEventHandler(type, eventHandler)
                iter.remove()
            }
        }

    }
}