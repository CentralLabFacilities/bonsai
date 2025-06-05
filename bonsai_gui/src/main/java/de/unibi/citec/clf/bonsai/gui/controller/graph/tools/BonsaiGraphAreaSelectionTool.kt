package de.unibi.citec.clf.bonsai.gui.controller.graph.tools

import de.unibi.citec.clf.bonsai.gui.model.graph.BonsaiGraphModel
import de.unibi.citec.clf.bonsai.gui.controller.graph.BonsaiGraphZoomHandler
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdge
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdgeWayPoint
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiNode
import javafx.animation.Animation
import javafx.animation.KeyFrame
import javafx.animation.Timeline
import javafx.geometry.Bounds
import javafx.scene.input.MouseEvent
import javafx.scene.layout.Pane
import javafx.scene.paint.Color
import javafx.scene.shape.Rectangle
import javafx.util.Duration
import kotlin.collections.iterator

class BonsaiGraphAreaSelectionTool(private val owningControl: Pane, private val model: BonsaiGraphModel, private val zoomHandler: BonsaiGraphZoomHandler) : BonsaiGraphTool() {

    private val currentSelection: HashSet<BonsaiNode> = HashSet()

    private var currentSelectionRectangle: Rectangle? = null
    private var interactiveSelectionRectangle: Rectangle? = null
    private var currentSelectionTimeline: Timeline? = null
    private var interactiveSelectionTimeline: Timeline? = null

    private var dragging: Boolean = false
    private var mousePressedOnNodeOrSelection: Boolean = false
    private var pressedWaypoint: BonsaiEdgeWayPoint? = null
    private var lastDragX: Double = 0.0
    private var lastDragY: Double = 0.0

    private fun resetSelection() {
        currentSelection.clear()
    }

    private fun add(node: BonsaiNode) {
        currentSelection.add(node)
    }

    fun updateSelectionInScene() {
        if (currentSelectionRectangle != null) {
            owningControl.children.remove(currentSelectionRectangle)
            currentSelectionTimeline!!.stop()
        }
        if (currentSelection.isNotEmpty()) {
            var minX: Double = Double.MAX_VALUE
            var maxX: Double = Double.MIN_VALUE
            var minY: Double = Double.MAX_VALUE
            var maxY: Double = Double.MIN_VALUE

            for (node in currentSelection) {
                val bounds: Bounds = node.wrappedNode.boundsInParent
                minX = minX.coerceAtMost(bounds.minX)
                minY = minY.coerceAtMost(bounds.minY)
                maxX = maxX.coerceAtLeast(bounds.maxX)
                maxY = maxY.coerceAtLeast(bounds.maxY)
            }

            val startX: Double = minX - 20.0
            val startY: Double = minY - 20.0
            val width: Double = maxX - minX + 40.0
            val height: Double = maxY - minY + 40.0

            currentSelectionRectangle = Rectangle(startX, startY, width, height).apply {
                strokeWidth = 1.0
                stroke = Color.BLACK
                strokeDashArray.addAll(3.0, 7.0, 3.0, 7.0)
                fill = Color.TRANSPARENT
                isMouseTransparent = true
                translateZ = SELECTION_Z_OFFSET
            }


            owningControl.children.add(currentSelectionRectangle)

            val duration: Duration = Duration.millis(1000.0 / 25.0)
            val keyFrame = KeyFrame(duration, {
                currentSelectionRectangle!!.strokeDashOffset += 1
            })

            currentSelectionTimeline = Timeline(keyFrame).apply {
                cycleCount = Animation.INDEFINITE
                play()
            }
        }
    }

    fun contains(node: BonsaiNode): Boolean {
        return currentSelection.contains(node)
    }

    private fun remove(node: BonsaiNode) {
        currentSelection.remove(node)
    }

    private fun isSelectionMode(): Boolean {
        return interactiveSelectionRectangle != null
    }

    private fun startSelectionAt(sceneX: Double, sceneY: Double) {
        interactiveSelectionRectangle = Rectangle(sceneX, sceneY, 1.0, 1.0).apply {
            strokeWidth = 1.0
            stroke = Color.BLACK
            strokeDashArray.addAll(3.0, 7.0, 3.0, 7.0)
            fill = Color.TRANSPARENT
            isMouseTransparent = true
            translateZ = SELECTION_Z_OFFSET
        }


        owningControl.children.add(interactiveSelectionRectangle)

        val duration: Duration = Duration.millis(1000.0 / 25.0)
        val keyFrame = KeyFrame(duration, {
            interactiveSelectionRectangle!!.strokeDashOffset += 1
        })

        interactiveSelectionTimeline = Timeline(keyFrame).apply {
            cycleCount = Animation.INDEFINITE
            play()
        }
    }

    private fun enhanceSelectionTo(sceneX: Double, sceneY: Double) {
        val width: Double = sceneX - interactiveSelectionRectangle!!.x
        val height: Double = sceneY - interactiveSelectionRectangle!!.y

        interactiveSelectionRectangle!!.apply {
            this.width = width
            this.height = height
        }
    }

    private fun endSelection() {
        for (node in model.nodes) {
            if (interactiveSelectionRectangle!!.intersects(node.value.wrappedNode.boundsInParent)) {
                add(node.value)
            }
        }

        interactiveSelectionTimeline!!.stop()
        interactiveSelectionTimeline = null

        owningControl.children.remove(interactiveSelectionRectangle)
        interactiveSelectionRectangle = null

        updateSelectionInScene()
    }

    override fun mousePressedOnNode(event: MouseEvent, node: BonsaiNode) {
        mousePressedOnNodeOrSelection = true
        pressedWaypoint = null

        if (!(event.isControlDown || event.isShiftDown)) {
            resetSelection()
            add(node)
        } else {
            if (contains(node)) {
                remove(node)
            } else {
                add(node)
            }
        }
        updateSelectionInScene()
    }

    override fun mousePressedOnEdge(event: MouseEvent, edge: BonsaiEdge) {
        mousePressedOnNodeOrSelection = true
        pressedWaypoint = null

        if (event.isShiftDown) {
            edge.addWayPoint(BonsaiEdgeWayPoint(edge, event.sceneX / zoomHandler.currentZoomLevel, event.sceneY / zoomHandler.currentZoomLevel))
        }
        resetSelection()
        updateSelectionInScene()
    }

    override fun mousePressedOnEdgeWayPoint(event: MouseEvent, wayPoint: BonsaiEdgeWayPoint) {
        mousePressedOnNodeOrSelection = false
        pressedWaypoint = wayPoint
    }

    override fun mousePressed(event: MouseEvent) {
        mousePressedOnNodeOrSelection = false
        pressedWaypoint = null
        currentSelectionRectangle?.let {
            mousePressedOnNodeOrSelection = it.contains(event.sceneX, event.sceneY)
        }
        if (!mousePressedOnNodeOrSelection) {
            resetSelection()
        }
    }

    override fun mouseDragged(event: MouseEvent) {
        if (mousePressedOnNodeOrSelection || pressedWaypoint != null) {
            if (!dragging) {
                dragging = true
            } else {
                val movementX: Double = event.sceneX - lastDragX
                val movementY: Double = event.sceneY - lastDragY

                if (pressedWaypoint == null) {
                    for (node in currentSelection) {
                        node.translatePosition(movementX, movementY, zoomHandler.currentZoomLevel)
                    }
                } else {
                    pressedWaypoint!!.translatePosition(movementX / zoomHandler.currentZoomLevel, movementY / zoomHandler.currentZoomLevel, zoomHandler.currentZoomLevel)
                }
                updateSelectionInScene()
            }
            lastDragX = event.sceneX
            lastDragY = event.sceneY
        } else {
            if (!isSelectionMode()) {
                if (!(event.isShiftDown || event.isControlDown)) {
                    resetSelection()
                }
                startSelectionAt(event.sceneX, event.sceneY)
            } else {
                enhanceSelectionTo(event.sceneX, event.sceneY)
            }
        }
    }

    override fun mouseReleased(event: MouseEvent) {
        if (dragging) {
            dragging = false
            updateSelectionInScene()
        }
        if (isSelectionMode()) {
            endSelection()
        }
    }

    companion object {
        const val SELECTION_Z_OFFSET: Double = 20.0
    }
}