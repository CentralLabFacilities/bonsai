package de.unibi.citec.clf.bonsai.gui.controller.graph.tools

import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdge
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdgeWayPoint
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiNode
import javafx.scene.input.MouseEvent
import javafx.scene.layout.Pane

class BonsaiGraphMovePaneTool(private val owningControl: Pane): BonsaiGraphTool() {

    private var mouseX: Double = 0.0
    private var mouseY: Double = 0.0

    override fun mousePressedOnNode(event: MouseEvent, node: BonsaiNode) {
        mousePressed(event)
    }

    override fun mousePressedOnEdge(event: MouseEvent, edge: BonsaiEdge) {
        mousePressed(event)
    }

    override fun mousePressedOnEdgeWayPoint(event: MouseEvent, wayPoint: BonsaiEdgeWayPoint) {
        mousePressed(event)
    }

    override fun mousePressed(event: MouseEvent) {
        mouseX = event.sceneX
        mouseY = event.sceneY
    }

    override fun mouseDragged(event: MouseEvent) {
        val movementX = event.sceneX - mouseX
        val movementY = event.sceneY - mouseY
        owningControl.relocate(owningControl.layoutX + movementX, owningControl.layoutY + movementY)
        mouseX = event.sceneX
        mouseY = event.sceneY
    }

    override fun mouseReleased(event: MouseEvent) {
    }
}