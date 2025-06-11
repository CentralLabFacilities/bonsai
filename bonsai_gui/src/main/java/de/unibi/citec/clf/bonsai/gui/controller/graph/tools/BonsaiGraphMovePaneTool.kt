package de.unibi.citec.clf.bonsai.gui.controller.graph.tools

import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdge
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdgeWayPoint
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiGraph
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiNode
import javafx.scene.input.MouseEvent

class BonsaiGraphMovePaneTool(private val graph: BonsaiGraph): BonsaiGraphTool() {

    private var lastDragX: Double = 0.0
    private var lastDragY: Double = 0.0
    private var dragging: Boolean = false

    override fun mousePressedOnNode(event: MouseEvent, node: BonsaiNode) {
    }

    override fun mousePressedOnEdge(event: MouseEvent, edge: BonsaiEdge) {
    }

    override fun mousePressedOnEdgeWayPoint(event: MouseEvent, wayPoint: BonsaiEdgeWayPoint) {
    }

    override fun mousePressed(event: MouseEvent) {
    }

    override fun mouseDragged(event: MouseEvent) {
        if (!dragging) {
            dragging = true
        } else {
            val movementX = event.sceneX - lastDragX
            val movementY = event.sceneY - lastDragY
            graph.hvalue += movementX / graph.width * MOVEMENT_MULTIPLIER
            graph.vvalue += movementY / graph.height * MOVEMENT_MULTIPLIER
        }
        lastDragX = event.sceneX
        lastDragY = event.sceneY
    }

    override fun mouseReleased(event: MouseEvent) {
        if (dragging) {
            dragging = false
        }
    }
    companion object {
        const val MOVEMENT_MULTIPLIER: Double = 5.0
    }
}