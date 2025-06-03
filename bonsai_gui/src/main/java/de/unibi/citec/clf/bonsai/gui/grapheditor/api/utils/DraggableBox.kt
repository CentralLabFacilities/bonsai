package de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.EditorElement
import javafx.event.Event
import javafx.geometry.Point2D
import javafx.scene.Node
import javafx.scene.Parent
import javafx.scene.input.MouseButton
import javafx.scene.layout.StackPane
import javafx.scene.input.MouseEvent
import javafx.scene.layout.Region
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * A draggable box that can display children.
 *
 * <p>
 * This is a subclass of {@link StackPane} and will lay out its children accordingly. The size of the box should be set
 * via {@code resize(width, height)}, and will not be affected by parent layout.
 * </p>
 */
open class DraggableBox(private val type: EditorElement?): StackPane() {

    companion object {
        const val DEFAULT_ALIGNMENT_THRESHOLD = 5.0
    }

    var lastLayoutX: Double = 0.0
    var lastLayoutY: Double = 0.0
    var lastMouseX: Double = 0.0
    var lastMouseY: Double = 0.0

    lateinit var editorProperties: GraphEditorProperties

    var alignmentTargetsX: List<Double> = mutableListOf()
    var alignmentTargetsY: List<Double> = mutableListOf()

    private var alignmentThreshold: Double = DEFAULT_ALIGNMENT_THRESHOLD

    var snapToGridOffset: Point2D = Point2D.ZERO

    var dependencyX: DraggableBox? = null
    var dependencyY: DraggableBox? = null

    init {
        isPickOnBounds = false
        addEventHandler(MouseEvent.MOUSE_PRESSED, this::handleMousePressed)
        addEventHandler(MouseEvent.MOUSE_DRAGGED, this::handleMouseDragged)
        addEventHandler(MouseEvent.MOUSE_RELEASED, this::handleMouseReleased)
    }

    open fun dispose() {
        finishGesture(GraphInputGesture.MOVE)
        dependencyX = null
        dependencyY = null
    }

    override fun isResizable(): Boolean {
        return false
    }

    /**
     * Gets whether or not the current mouse position would lead to a resize
     * operation.
     *
     * @return {@code true} if the mouse is near the edge of the rectangle so
     *         that a resize would occur
     */
    open fun isMouseInPositionForResize(): Boolean {
        return false
    }

    /**
     * @return negated value of {@link GraphEditorProperties#isReadOnly(EditorElement)}
     */
    protected open fun isEditable(): Boolean {
        return type?.let { !editorProperties.isReadOnly(it) } ?: false
    }

    /**
     * activate the given {@link GraphInputGesture}
     */
    fun activateGesture(gesture: GraphInputGesture, event: Event): Boolean {
        return editorProperties.activateGesture(gesture, event, this)
    }

    /**
     * deactivate the given {@link GraphInputGesture}
     */
    fun finishGesture(gesture: GraphInputGesture): Boolean {
        return editorProperties.finishGesture(gesture, this)
    }

    /**
     * Handles mouse-pressed events.
     *
     * @param event
     *            a {@link MouseEvent}
     */
    protected open fun handleMousePressed(event: MouseEvent) {
        if (event.button != MouseButton.PRIMARY || !isEditable()) return
        val cursorPosition: Point2D = GeometryUtils.getCursorPosition(event, getContainer(this))
        storeClickValuesForDrag(cursorPosition.x, cursorPosition.y)
        event.consume()
    }

    /**
     * Handles mouse-dragged events.
     *
     * @param event {@link MouseEvent}
     */
    protected open fun handleMouseDragged(event: MouseEvent) {
        if (event.button != MouseButton.PRIMARY || !isEditable() || !activateGesture(GraphInputGesture.MOVE, event)) return
        val cursorPosition: Point2D = GeometryUtils.getCursorPosition(event, getContainer(this))
        handleDrag(cursorPosition.x, cursorPosition.y)
        event.consume()
    }

    /**
     * Handles mouse-released events.
     *
     * @param event {@link MouseEvent}
     */
    protected open fun handleMouseReleased(event: MouseEvent) {
        if (finishGesture(GraphInputGesture.MOVE)) event.consume()
    }

    /**
     * Stores relevant layout values at the time of the last mouse click
     * (mouse-pressed event).
     *
     * @param x
     *            the container-x position of the click event
     * @param y
     *            the container-y position of the click event
     */
    protected fun storeClickValuesForDrag(x: Double, y: Double) {
        lastLayoutX = layoutX
        lastLayoutY = layoutY
        lastMouseX = x
        lastMouseY = y
    }

    /**
     * Rounds some value to the nearest multiple of the grid spacing.
     *
     * @param valueToRound
     *            a double value
     *
     * @return the input value rounded to the nearest multiple of the grid
     *         spacing
     */
    protected fun roundToGridSpacing(valueToRound: Double): Double {
        return GeometryUtils.roundToGridSpacing(editorProperties, valueToRound)
    }

    open fun positionMoved() {
        // empty, to be overridden by custom skin logic
    }

    /**
     * Handles a drag event to the given cursor position.
     *
     * @param x
     *            the cursor x position relative to the container
     * @param y
     *            the cursor y position relative to the container
     */
    private fun handleDrag(x: Double, y: Double) {
        handleDragX(x)
        handleDragY(y)
        positionMoved()
    }

    /**
     * @return {@link GraphEditorProperties#isSnapToGridOn()}
     */
    protected fun isSnapToGrid(): Boolean {
        return editorProperties.snapToGrid
    }

    /**
     * @return {@link GraphEditorProperties#getWestBoundValue()}
     */
    protected fun getWestBoundValue(): Double {
        return editorProperties.westBoundValue
    }

    /**
     * @return {@link GraphEditorProperties#getNorthBoundValue()}
     */
    protected fun getNorthBoundValue(): Double {
        return editorProperties.northBoundValue
    }

    /**
     * @return {@link GraphEditorProperties#getSouthBoundValue()}
     */
    protected fun getSouthBoundValue(): Double {
        return editorProperties.southBoundValue
    }

    /**
     * @return {@link GraphEditorProperties#getEastBoundValue()}
     */
    protected fun getEastBoundValue(): Double {
        return editorProperties.eastBoundValue
    }

    /**
     * Handles the x component of a drag event to the given cursor x position.
     *
     * @param x
     *            the cursor x position
     */
    private fun handleDragX(x: Double) {
        val maxParentWidth: Double = parent.layoutBounds.width
        val minLayoutX: Double = getWestBoundValue()
        val maxLayoutX: Double = maxParentWidth - width - getEastBoundValue()
        val scaleFactor: Double = localToSceneTransform.mxx

        var newLayoutX: Double = lastLayoutX + (x - lastMouseX) / scaleFactor

        if (isSnapToGrid()) {
            newLayoutX = roundToGridSpacing(newLayoutX - snapToGridOffset.x) + snapToGridOffset.x
        } else {
            newLayoutX = newLayoutX.roundToInt().toDouble()
            if (alignmentTargetsX.isNotEmpty()) {
                newLayoutX = align(newLayoutX, alignmentTargetsX)
            }
        }
        if (newLayoutX < minLayoutX) {
            newLayoutX = minLayoutX
        } else if (newLayoutX > maxLayoutX) {
            newLayoutX = maxLayoutX
        }

        layoutX = newLayoutX
        dependencyX?.layoutX = newLayoutX
    }

    /**
     * Handles the y component of a drag event to the given cursor y position.
     *
     * @param y
     *            the cursor y-position
     */
    private fun handleDragY(y: Double) {
        val maxParentHeight: Double = parent.layoutBounds.height
        val minLayoutY: Double = getNorthBoundValue()
        val maxLayoutY: Double = maxParentHeight - height - getSouthBoundValue()
        val scaleFactor: Double = localToSceneTransform.mxx

        var newLayoutY: Double = lastLayoutY + (y - lastMouseY) / scaleFactor

        if (isSnapToGrid()) {
            newLayoutY = roundToGridSpacing(newLayoutY - snapToGridOffset.y) + snapToGridOffset.y
        } else {
            newLayoutY = newLayoutY.roundToInt().toDouble()
            if(alignmentTargetsY.isNotEmpty()) {
                newLayoutY = align(newLayoutY, alignmentTargetsY)
            }
        }
        if (newLayoutY < minLayoutY) {
            newLayoutY = minLayoutY
        } else if (newLayoutY > maxLayoutY) {
            newLayoutY = maxLayoutY
        }

        layoutY = newLayoutY
        dependencyY?.layoutY = newLayoutY
    }

    /**
     * Gets the closest ancestor (e.g. parent, grandparent) to a node that is a
     * subclass of {@link Region}.
     *
     * @param node
     *            a JavaFX {@link Node}
     * @return the node's closest ancestor that is a subclass of {@link Region},
     *         or {@code null} if none exists
     */
    fun getContainer(node: Node): Region? {
        val parent: Parent = node.parent
        return when (node.parent) {
            is Region -> Region()
            null -> null
            else -> getContainer(parent)
        }
    }

    /**
     * Aligns the given position to the first alignment value that is closer than the alignment threshold.
     *
     * <p>
     * Returns the original position if no alignment values are nearby.
     * </p>
     *
     * @param pos the position to be aligned
     * @param alignmentValues the list of the alignment values
     * @return the new position after alignment
     */
    private fun align(pos: Double, alignmentValues: List<Double>): Double {
        for (alignmentValue in alignmentValues) {
            if (abs(alignmentValue - pos) <= alignmentThreshold) return alignmentValue
        }
        return pos
    }
}