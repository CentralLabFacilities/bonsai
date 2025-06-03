package de.unibi.citec.clf.bonsai.gui.view.graph.node

import de.unibi.citec.clf.bonsai.gui.view.graph.core.BonsaiGraph
import javafx.scene.Node

class BonsaiNode(var wrappedNode: Node, var graph: BonsaiGraph, private var posX: Double, private var posY: Double) {

    init {
        graph.addNode(this)
        wrappedNode.relocate(posX, posY)
        graph.updateEdgeNodesFor(this)
    }

    fun translatePosition(movementX: Double, movementY: Double, zoomLevel: Double) {
        wrappedNode.apply {
            layoutX += movementX
            layoutY += movementY
        }
        posX += movementX / zoomLevel
        posY += movementY / zoomLevel

        graph.updateEdgeNodesFor(this)
    }

    fun setZoomLevel(zoomLevel: Double) {
        wrappedNode.apply {
            layoutX = posX * zoomLevel
            layoutY = posY * zoomLevel
            scaleX = zoomLevel
            scaleY = zoomLevel

        }
        graph.updateEdgeNodesFor(this, zoomLevel)
    }
}