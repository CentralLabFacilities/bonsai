package de.unibi.citec.clf.bonsai.gui.view.graph.node

import de.unibi.citec.clf.bonsai.gui.view.graph.core.BonsaiGraph
import javafx.scene.Node;

class BonsaiNode(var wrappedNode: Node, var graph: BonsaiGraph) {
    private var posX: Double = 0.0;
    private var posY: Double = 0.0;

    fun setPos(posX: Double, posY: Double) {
        wrappedNode.relocate(posX, posY);
        this.posX = posX;
        this.posY = posY;

        graph.updateEdgeNodesFor(this)
    }

    fun translatePosition(movementX: Double, movementY: Double, zoomLevel: Double) {
        wrappedNode.layoutX += movementX
        wrappedNode.layoutY += movementY
        posX += movementX / zoomLevel
        posY += movementY / zoomLevel

        graph.updateEdgeNodesFor(this)
    }

    fun setZoomLevel(zoomLevel: Double) {
        wrappedNode.layoutX = posX * zoomLevel
        wrappedNode.layoutY = posY * zoomLevel
        wrappedNode.scaleX = zoomLevel
        wrappedNode.scaleY = zoomLevel

        graph.updateEdgeNodesFor(this, zoomLevel)
    }
}