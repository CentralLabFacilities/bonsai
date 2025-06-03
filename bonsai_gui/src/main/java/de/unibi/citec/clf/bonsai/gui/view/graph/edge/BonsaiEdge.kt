package de.unibi.citec.clf.bonsai.gui.view.graph.edge

import de.unibi.citec.clf.bonsai.gui.view.graph.core.BonsaiGraph
import de.unibi.citec.clf.bonsai.gui.view.graph.node.BonsaiNode
import javafx.scene.Node
import javafx.scene.layout.Pane
import javafx.scene.paint.Color
import javafx.scene.shape.LineTo
import javafx.scene.shape.MoveTo
import javafx.scene.shape.Path
import javafx.scene.shape.Rectangle


class BonsaiEdge(val graph: BonsaiGraph, val source: BonsaiNode, val destination: BonsaiNode, val wayPoints: MutableList<BonsaiEdgeWayPoint> = mutableListOf()) {
    var displayShape: Node? = null
    val wayPointHandles: HashMap<BonsaiEdgeWayPoint, Node> = HashMap()

    init {
        graph.addEdge(this)
    }

    fun addWayPoint(wayPoint: BonsaiEdgeWayPoint) {
        wayPoints.add(wayPoint)
        graph.updateEdge(this, graph.zoomHandler.currentZoomLevel)
    }

    fun removeWayPoint(wayPoint: BonsaiEdgeWayPoint) {
        wayPoints.remove(wayPoint)
        graph.updateEdge(this, graph.zoomHandler.currentZoomLevel)
    }

    private fun compileDisplayShapeFor(wayPoint: BonsaiEdgeWayPoint, zoomLevel: Double): Node {
        val node = Rectangle(4.0, 4.0, Color.RED).apply {
            stroke = Color.RED
            scaleX = zoomLevel
            scaleY = zoomLevel
            layoutX = (wayPoint.positionX - 2) * zoomLevel
            layoutY = (wayPoint.positionY - 2) * zoomLevel
            userData = wayPoint
        }



        return node
    }

    fun computeDisplayShape(currentZoomLevel: Double) {
        val path = Path()
        path.userData = this
        val sourceBounds = source.wrappedNode.boundsInParent
        val moveTo = MoveTo(sourceBounds.minX + sourceBounds.width / 2, sourceBounds.minY + sourceBounds.height / 2)
        path.elements.add(moveTo)

        wayPointHandles.clear()

        for (wayPoint in wayPoints) {
            wayPointHandles[wayPoint] = compileDisplayShapeFor(wayPoint, currentZoomLevel)
            val lineTo = LineTo(wayPoint.positionX * currentZoomLevel, wayPoint.positionY * currentZoomLevel)
            path.elements.add(lineTo)
        }

        val destinationBounds = destination.wrappedNode.boundsInParent
        val lineTo = LineTo(destinationBounds.minX + destinationBounds.width / 2, destinationBounds.minY + destinationBounds.height / 2)
        path.apply {
            elements.add(lineTo)
            stroke = Color.RED
            strokeWidth = 2.0
        }

        displayShape = path
    }

    fun removeAllNodes(pane: Pane) {
        pane.children.remove(displayShape)
        pane.children.removeAll(wayPointHandles.values)
    }

    fun addAllNodes(pane: Pane, zIndex: Double) {
        pane.children.add(displayShape)
        displayShape?.translateZ = zIndex
        displayShape?.toBack()

        for (node in wayPointHandles.values) {
            node.translateZ = zIndex
            pane.children.add(node)
            node.toBack()
        }
    }
}