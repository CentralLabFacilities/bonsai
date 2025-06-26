package de.unibi.citec.clf.bonsai.gui.grapheditor.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.BonsaiEditorElement
import javafx.event.Event
import javafx.geometry.Point2D
import javafx.scene.Node
import javafx.scene.Parent
import javafx.scene.input.MouseButton
import javafx.scene.layout.StackPane
import javafx.scene.input.MouseEvent
import javafx.scene.layout.Region
import kotlin.math.abs

open class DraggableBox(private val type: BonsaiEditorElement): StackPane() {

    companion object {
        const val DEFAULT_ALIGNMENT_THRESHOLD = 5.0
    }

    private var lastLayoutX: Double = 0.0
    private var lastLayoutY: Double = 0.0
    private var lastMouseX: Double = 0.0
    private var lastMouseY: Double = 0.0

    private var editorProperties: BonsaiGraphEditorProperties? = null

    private val alignmentTargetsX: List<Double> = mutableListOf()
    private val alignmentTargetsY: List<Double> = mutableListOf()

    private var alignmentThreshold: Double = DEFAULT_ALIGNMENT_THRESHOLD

    private var snapToGridOffset: Point2D = Point2D.ZERO

    private var dependencyX: DraggableBox? = null
    private var dependencyY: DraggableBox? = null

    init {
        isPickOnBounds = false
        addEventHandler(MouseEvent.MOUSE_PRESSED, this::handleMousePressed)
        addEventHandler(MouseEvent.MOUSE_DRAGGED, this::handleMouseDragged)
        addEventHandler(MouseEvent.MOUSE_RELEASED, this::handleMouseReleased)
    }

    fun dispose() {
        finishGesture(BonsaiGraphInputGesture.MOVE)
        dependencyX = null
        dependencyY = null
    }

    override fun isResizable(): Boolean {
        return false
    }

    fun isMouseInPositionForResize(): Boolean {
        return false
    }

    private fun isEditable(): Boolean {
        return editorProperties != null && !editorProperties.isReadOnly(type)
    }

    fun activateGesture(gesture: BonsaiGraphInputGesture, event: Event): Boolean {
        return editorProperties.activateGesture(gesture, event, this) ?: true
    }

    fun finishGesture(gesture: BonsaiGraphInputGesture): Boolean {
        return editorProperties.finishGesture(gesture, this) ?: true
    }

    private fun handleMousePressed(event: MouseEvent) {
        if (event.button != MouseButton.PRIMARY || !isEditable()) return
        val cursorPosition: Point2D = BonsaiGeometryUtils.getCursorPosition(event, getContainer(this))
        storeClickValuesForDrag(cursorPosition.x, cursorPosition.y)
        event.consume()
    }

    private fun handleMouseDragged(event: MouseEvent) {
        if (event.button != MouseButton.PRIMARY || !isEditable() || !activateGesture(BonsaiGraphInputGesture.MOVE, event)) return
        val cursorPosition: Point2D = BonsaiGeometryUtils.getCursorPosition(event, getContainer(this))
        handleDrag(cursorPosition.x, cursorPosition.y)
        event.consume()
    }

    private fun handleMouseReleased(event: MouseEvent) {
        if (finishGesture(BonsaiGraphInputGesture.MOVE)) event.consume()
    }

    private fun storeClickValuesForDrag(x: Double, y: Double) {
        lastLayoutX = layoutX
        lastLayoutY = layoutY
        lastMouseX = x
        lastMouseY = y
    }

    private fun roundToGridSpacing(valueToRound: Double): Double {
        return BonsaiGeometryUtils.roundToGridSpacing(editorProperties, valueToRound)
    }

    fun positionMoved() {
    }

    private fun handleDrag(x: Double, y: Double) {
        handleDragX(x)
        handleDragY(y)
        positionMoved()
    }

    private fun isSnapToGrid(): Boolean {
        return editorProperties.isSnapToGridOn() ?: false
    }

    private fun getWestBoundValue(): Double {
        return editorProperties.westBoundValue ?: BonsaiGraphEditorProperties.DEFAULT_BOUND_VALUE
    }

    private fun getNorthBoundValue(): Double {
        return editorProperties.northBoundValue ?: BonsaiGraphEditorProperties.DEFAULT_BOUND_VALUE
    }

    private fun getSouthBoundValue(): Double {
        return editorProperties.southBoundValue ?: BonsaiGraphEditorProperties.DEFAULT_BOUND_VALUE
    }

    private fun getEastBoundValue(): Double {
        return editorProperties.eastBoundValue ?: BonsaiGraphEditorProperties.DEFAULT_BOUND_VALUE
    }

    private fun handleDragX(x: Double) {
        val maxParentWidth: Double = parent.layoutBounds.width
        val minLayoutX: Double = getWestBoundValue()
        val maxLayoutX: Double = maxParentWidth - width - getEastBoundValue()
        val scaleFactor: Double = localToSceneTransform.mxx

        var newLayoutX: Double = lastLayoutX + (x - lastMouseX) / scaleFactor

        if (isSnapToGrid()) {
            newLayoutX = roundToGridSpacing(newLayoutX - snapToGridOffset.x) + snapToGridOffset.x
        } else {
            newLayoutX = Math.round(newLayoutX).toDouble()
            if (alignmentTargetsX.isNotEmpty()) {
                newLayoutX = align(newLayoutX, alignmentTargetsX)
            }
        }
        if (editorProperties != null && newLayoutX < minLayoutX) {
            newLayoutX = minLayoutX
        } else if (newLayoutX > maxLayoutX) {
            newLayoutX = maxLayoutX
        }

        layoutX = newLayoutX
        dependencyX?.layoutX = newLayoutX
    }

    private fun handleDragY(y: Double) {
        val maxParentHeight: Double = parent.layoutBounds.height
        val minLayoutY: Double = getNorthBoundValue()
        val maxLayoutY: Double = maxParentHeight - height - getSouthBoundValue()
        val scaleFactor: Double = localToSceneTransform.mxx

        var newLayoutY: Double = lastLayoutY + (y - lastMouseY) / scaleFactor

        if (isSnapToGrid()) {
            newLayoutY = roundToGridSpacing(newLayoutY - snapToGridOffset.y) + snapToGridOffset.y
        } else {
            newLayoutY = Math.round(newLayoutY).toDouble()
            if(alignmentTargetsY.isNotEmpty()) {
                newLayoutY = align(newLayoutY, alignmentTargetsY)
            }
        }
        if (editorProperties != null && newLayoutY < minLayoutY) {
            newLayoutY = minLayoutY
        } else if (newLayoutY > maxLayoutY) {
            newLayoutY = maxLayoutY
        }

        layoutY = newLayoutY
        dependencyY?.layoutY = newLayoutY
    }

    fun getContainer(node: Node): Region? {
        val parent: Parent = node.parent
        return when (node.parent) {
            is Region -> Region()
            null -> null
            else -> getContainer(parent)
        }
    }

    private fun align(pos: Double, alignmentValues: List<Double>): Double {
        for (alignmentValue in alignmentValues) {
            if (abs(alignmentValue - pos) <= alignmentThreshold) return alignmentValue
        }
        return pos
    }
}