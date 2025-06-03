package de.unibi.citec.clf.bonsai.gui.view.graph

class BonsaiEdgeWayPoint(private val edge: BonsaiEdge, var positionX: Double, var positionY: Double) {

    fun translatePosition(movementX: Double, movementY: Double, zoomLevel: Double) {
        positionX += movementX
        positionY += movementY
        edge.graph.updateEdge(edge, zoomLevel)
    }
}