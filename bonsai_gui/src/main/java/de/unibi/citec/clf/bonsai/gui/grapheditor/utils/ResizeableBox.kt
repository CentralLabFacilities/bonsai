package de.unibi.citec.clf.bonsai.gui.grapheditor.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.BonsaiEditorElement
import javafx.geometry.Point2D
import javafx.scene.Cursor
import javafx.scene.input.MouseEvent
import javafx.scene.layout.Region
import kotlin.math.max
import kotlin.math.round

class ResizeableBox(type: BonsaiEditorElement) : DraggableBox(type) {

    init {
        addEventHandler(MouseEvent.MOUSE_ENTERED, this::processMousePosition)
        addEventHandler(MouseEvent.MOUSE_MOVED, this::processMousePosition)
        addEventHandler(MouseEvent.MOUSE_EXITED, this::handleMouseExited)
    }

    companion object {
        private const val DEFAULT_RESIZE_BORDER_TOLERANCE: Int = 8
        private fun isResizeCursor(cursor: Cursor): Boolean {
            return cursor == Cursor.NE_RESIZE ||
                    cursor == Cursor.NW_RESIZE ||
                    cursor == Cursor.SE_RESIZE ||
                    cursor == Cursor.SW_RESIZE ||
                    cursor == Cursor.N_RESIZE ||
                    cursor == Cursor.S_RESIZE ||
                    cursor == Cursor.E_RESIZE ||
                    cursor == Cursor.W_RESIZE
        }
    }

    private var lastWidth: Double = 0.0
    private var lastHeight: Double = 0.0

    private var lastMouseRegion: RectangleMouseRegion? = null

    private var mouseInPositionForResize: Boolean = false

    override fun dispose() {
        finishGesture(BonsaiGraphInputGesture.RESIZE)
        super.dispose()
    }

    override fun isMouseInPositionForResize(): Boolean {
        return mouseInPositionForResize
    }

    override fun handleMousePressed(event: MouseEvent) {
        super.handleMousePressed(event)
        if (parent !is Region) {
            return
        } else if (!event.isPrimaryButtonDown || !isEditable()) {
            cursor = null
            return
        }
        storeClickValuesForResize(event.x, event.y)
    }

    override fun handleMouseDragged(event: MouseEvent) {
        if (lastMouseRegion == null || parent !is Region || !event.isPrimaryButtonDown || !isEditable()) {
            cursor = null
            return
        }
        val cursorPosition: Point2D = BonsaiGeometryUtils.getCursorPosition(event, getContainer(this))
        if (lastMouseRegion == RectangleMouseRegion.INSIDE) {
            super.handleMouseDragged(event)
        } else if (lastMouseRegion != RectangleMouseRegion.OUTSIDE && isResizeCursor(cursor) && activateGesture(
                BonsaiGraphInputGesture.RESIZE, event
            )
        ) {
            handleResize(cursorPosition.x, cursorPosition.y)
            event.consume()
        }
    }

    override fun handleMouseReleased(event: MouseEvent) {
        super.handleMouseReleased(event)
        processMousePosition(event)
        if (finishGesture(BonsaiGraphInputGesture.RESIZE)) {
            event.consume()
        }
    }

    fun handleMouseExited(event: MouseEvent) {
        if (!event.isPrimaryButtonDown) {
            cursor = null
        }
    }

    fun processMousePosition(event: MouseEvent) {
        if (event.isPrimaryButtonDown || !isEditable()) {
            return
        }
        val mouseRegion: RectangleMouseRegion = getMouseRegion(event.x, event.y)
        mouseInPositionForResize = mouseRegion != RectangleMouseRegion.INSIDE
        updateCursor(mouseRegion)
    }

    fun storeClickValuesForResize(x: Double, y: Double) {
        lastWidth = width
        lastHeight = height
        lastMouseRegion = getMouseRegion(x,y)
    }

    fun handleResize(x: Double, y: Double) {
        when(lastMouseRegion) {
            RectangleMouseRegion.NORTHEAST -> {
                handleResizeNorth(y)
                handleResizeEast(x)
                positionMoved()
            }
            RectangleMouseRegion.NORTHWEST -> {
                handleResizeNorth(y)
                handleResizeWest(x)
                positionMoved()
            }
            RectangleMouseRegion.SOUTHEAST -> {
                handleResizeSouth(y)
                handleResizeEast(x)
                positionMoved()
            }
            RectangleMouseRegion.SOUTHWEST -> {
                handleResizeSouth(y)
                handleResizeWest(x)
                positionMoved()
            }
            RectangleMouseRegion.NORTH -> {
                handleResizeNorth(y)
                positionMoved()
            }
            RectangleMouseRegion.SOUTH -> {
                handleResizeSouth(y)
                positionMoved()
            }
            RectangleMouseRegion.EAST -> {
                handleResizeEast(x)
                positionMoved()
            }
            RectangleMouseRegion.WEST -> {
                handleResizeWest(x)
                positionMoved()
            }

            else -> return
        }
    }

    fun handleResizeNorth(y: Double) {
        val scaleFactor: Double = localToSceneTransform.myy
        val yDragDistance: Double = (y - lastMouseY) / scaleFactor
        val minResizeHeight: Double = max(minHeight, 0.0)

        var newLayoutY: Double = lastLayoutY + yDragDistance
        var newHeight: Double = lastHeight - yDragDistance

        if (isSnapToGrid()) {
            val roundedLayoutY: Double = roundToGridSpacing(newLayoutY) - 1
            newHeight = newHeight - roundedLayoutY + newLayoutY
            newLayoutY = roundedLayoutY
        } else {
            val roundedLayoutY: Double = round(newLayoutY)
            newHeight = round(newHeight - roundedLayoutY + newLayoutY)
            newLayoutY = roundedLayoutY
        }

        if (newLayoutY < getNorthBoundValue()) {
            newLayoutY = getNorthBoundValue()
            newHeight = lastLayoutY + lastHeight - getNorthBoundValue()
        } else if (newHeight < minResizeHeight) {
            newLayoutY = lastLayoutY + lastHeight - minResizeHeight
            newHeight = minResizeHeight
        }

        layoutY = newLayoutY
        height = newHeight
    }

    fun handleResizeSouth(y: Double) {
        val scaleFactor: Double = localToSceneTransform.myy
        val yDragDistance: Double = (y - lastMouseY) / scaleFactor
        val maxParentHeight: Double = parent.layoutBounds.height

        val minResizeHeight: Double = max(minHeight, 0.0)
        val maxAvailableHeight = maxParentHeight - layoutY - getSouthBoundValue()

        var newHeight: Double = lastHeight + yDragDistance

        newHeight = if (isSnapToGrid()) {
            roundToGridSpacing(newHeight + lastLayoutY) - lastLayoutY
        } else {
            round(newHeight)
        }

        if (newHeight > maxAvailableHeight) {
            newHeight = maxAvailableHeight
        } else if (newHeight < minResizeHeight) {
            newHeight = minResizeHeight
        }

        height = newHeight
    }

    fun handleResizeEast(x: Double) {
        val scaleFactor: Double = localToSceneTransform.mxx

        val xDragDistance: Double = (x - lastMouseX) / scaleFactor
        val maxParentWidth: Double = parent.layoutBounds.width

        val minResizeWidth: Double = max(minWidth, 0.0)
        val maxAvailableWidth: Double = maxParentWidth - layoutX - getEastBoundValue()

        var newWidth: Double = lastWidth + xDragDistance

        newWidth = if (isSnapToGrid()) {
            roundToGridSpacing(newWidth + lastLayoutX) - lastLayoutX
        } else {
            round(newWidth)
        }

        if (newWidth > maxAvailableWidth) {
            newWidth = maxAvailableWidth
        } else if (newWidth < minResizeWidth) {
            newWidth = minResizeWidth
        }

        width = newWidth
    }

    fun handleResizeWest(x: Double) {
        val scaleFactor: Double = localToSceneTransform.mxx

        val xDragDistance: Double = (x - lastMouseX) / scaleFactor
        val minResizeWidth = max(minWidth, 0.0)

        var newLayoutX: Double = lastLayoutX + xDragDistance
        var newWidth: Double = lastWidth - xDragDistance

        if (isSnapToGrid()) {
            val roundedLayoutX: Double = roundToGridSpacing(newLayoutX) - 1
            newWidth = newWidth - roundedLayoutX + newLayoutX
            newLayoutX = roundedLayoutX
        } else {
            val roundedLayoutX: Double = round(newLayoutX)
            newWidth = round(newWidth - roundedLayoutX + newLayoutX)
            newLayoutX = roundedLayoutX
        }

        if (newLayoutX < getWestBoundValue()) {
            newLayoutX = getWestBoundValue()
            newWidth = lastLayoutX + lastWidth - getWestBoundValue()
        } else if (newWidth < minResizeWidth) {
            newLayoutX = lastLayoutX + lastWidth - minResizeWidth
            newWidth = minResizeWidth
        }

        layoutX = newLayoutX
        width = newWidth
    }

    private fun getMouseRegion(x: Double, y: Double): RectangleMouseRegion {
        if (x < 0 || y < 0 || x > width || y > height) {
            return RectangleMouseRegion.OUTSIDE
        }
        val isNorth: Boolean = y < DEFAULT_RESIZE_BORDER_TOLERANCE
        val isSouth: Boolean = y > height - DEFAULT_RESIZE_BORDER_TOLERANCE
        val isEast: Boolean = x > width - DEFAULT_RESIZE_BORDER_TOLERANCE
        val isWest: Boolean = x < DEFAULT_RESIZE_BORDER_TOLERANCE

        if (isNorth && isEast) {
            return RectangleMouseRegion.NORTHEAST
        } else if (isNorth && isWest) {
            return RectangleMouseRegion.NORTHWEST
        } else if (isSouth && isEast) {
            return RectangleMouseRegion.SOUTHEAST
        } else if (isSouth && isWest) {
            return RectangleMouseRegion.SOUTHWEST
        } else if (isNorth) {
            return RectangleMouseRegion.NORTH
        } else if (isSouth) {
            return RectangleMouseRegion.SOUTH
        } else if (isEast) {
            return RectangleMouseRegion.EAST
        } else if (isWest) {
            return RectangleMouseRegion.WEST
        } else {
            return RectangleMouseRegion.INSIDE
        }
    }

    private fun updateCursor(mouseRegion: RectangleMouseRegion) {
        cursor = when(mouseRegion) {
            RectangleMouseRegion.NORTHEAST -> Cursor.NE_RESIZE
            RectangleMouseRegion.NORTHWEST -> Cursor.NW_RESIZE
            RectangleMouseRegion.SOUTHEAST -> Cursor.SE_RESIZE
            RectangleMouseRegion.SOUTHWEST -> Cursor.SW_RESIZE
            RectangleMouseRegion.NORTH -> Cursor.N_RESIZE
            RectangleMouseRegion.SOUTH -> Cursor.S_RESIZE
            RectangleMouseRegion.EAST -> Cursor.E_RESIZE
            RectangleMouseRegion.WEST -> Cursor.W_RESIZE
            else -> null
        }
    }

    private enum class RectangleMouseRegion {
        NORTH, NORTHEAST, EAST, SOUTHEAST, SOUTH, SOUTHWEST, WEST, NORTHWEST, INSIDE, OUTSIDE
    }


}