package de.unibi.citec.clf.bonsai.gui.view.graph.core

import de.unibi.citec.clf.bonsai.gui.view.graph.edge.BonsaiEdge
import de.unibi.citec.clf.bonsai.gui.view.graph.edge.BonsaiEdgeWayPoint
import de.unibi.citec.clf.bonsai.gui.view.graph.node.BonsaiNode
import javafx.event.EventHandler
import javafx.scene.Node
import javafx.scene.input.MouseEvent
import javafx.scene.input.ScrollEvent

class BonsaiGraphMouseHandler(val graph: BonsaiGraph) {
    private val mousePressedEventHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> {
        println("Click!")
        val source = it.source
        if (source is Node) {
            val node: Node = source
            when (val userData = node.userData) {
                is BonsaiNode -> {
                    graph.currentTool.mousePressedOnNode(it, userData)
                }

                is BonsaiEdge -> {
                    graph.currentTool.mousePressedOnEdge(it, userData)
                }

                is BonsaiEdgeWayPoint -> {
                    graph.currentTool.mousePressedOnEdgeWayPoint(it, userData)
                }

                else -> {
                    graph.currentTool.mousePressed(it)
                }
            }
        } else {
            graph.currentTool.mousePressed(it)
        }
        it.consume()
    }
    private val mouseDraggedEventHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> {
        println("Dragged!")
        graph.currentTool.mouseDragged(it)
        it.consume()
    }
    private val mouseReleasedEventHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> {
        println("Released!")
        graph.currentTool.mouseReleased(it)
        it.consume()
    }
    private val scrollEventHandler: EventHandler<ScrollEvent> = EventHandler<ScrollEvent> {
        println("Scrolled!")
        if (it.deltaY > 0) {
            graph.zoomHandler.zoomOneStepOut()
        } else {
            graph.zoomHandler.zoomOneStepIn()
        }
    }

    init {
        graph.onScroll = scrollEventHandler
    }

    fun registerHandlerFor(node: Node) {
        node.onMouseDragged = mouseDraggedEventHandler
        node.onMousePressed = mousePressedEventHandler
        node.onMouseReleased = mouseReleasedEventHandler
        node.onScroll = scrollEventHandler
    }

    fun registerNewNode(node: BonsaiNode) {
        registerHandlerFor(node.wrappedNode)
    }

    fun registerNewEdge(edge: BonsaiEdge) {
        edge.displayShape?.let { registerHandlerFor(it) }
        for (node in edge.wayPointHandles.values) {
            registerHandlerFor(node)
        }
    }

}