package de.unibi.citec.clf.bonsai.gui.grapheditor.api.impl

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEventManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphInputGesture
import javafx.event.Event
import javafx.scene.Node
import javafx.scene.input.MouseEvent
import javafx.scene.input.ScrollEvent
import javafx.scene.input.TouchEvent

class GraphEventManagerImpl : GraphEventManager {

    private var gesture: GraphInputGesture = GraphInputGesture.NONE
    private var owner: Any? = null

    override fun activateGesture(gesture: GraphInputGesture, event: Event, owner: Any): Boolean {
        if (!canOverwrite(this.owner, owner)) return false
        if (canActivate(gesture, event)) {
            this.gesture = gesture
            this.owner = owner
            return true
        }
        return false
    }

    private fun canActivate(gesture: GraphInputGesture, event: Event): Boolean {
        val current: GraphInputGesture = this.gesture
        if (current == gesture) return true
        if (gesture == GraphInputGesture.NONE) return false
        current.let {
            val isTouch = event is TouchEvent || event is MouseEvent && event.isSynthesized || event is ScrollEvent && event.touchCount > 0
            return if (!isTouch) {
                when(gesture) {
                    GraphInputGesture.PAN -> event is ScrollEvent && !event.isControlDown || event is MouseEvent && event.isSecondaryButtonDown
                    GraphInputGesture.ZOOM -> event is ScrollEvent && event.isControlDown
                    else -> event is MouseEvent && event.isPrimaryButtonDown
                }
            } else {
                when(gesture) {
                    GraphInputGesture.ZOOM -> false
                    GraphInputGesture.PAN -> event is TouchEvent && event.touchCount > 1
                    else -> true
                }
            }
        }
    }

    override fun finishGesture(expectedGesture: GraphInputGesture, owner: Any): Boolean {
        if (gesture == expectedGesture && (owner == this.owner || !isVisible(owner))) {
            this.gesture = GraphInputGesture.NONE
            this.owner = null
            return true
        }
        return false
    }

    companion object {
        fun canOverwrite(existing: Any?, candidate: Any?): Boolean {
            return when {
                existing == candidate -> true
                candidate == null -> false
                else -> existing == null || !isVisible(existing)
            }
        }
        fun isVisible(node: Any?): Boolean {
            node?.let {
                if (node is Node) {
                    return node.isVisible && node.parent != null && node.scene != null
                }
                return true
            }
            return false
        }
    }
}