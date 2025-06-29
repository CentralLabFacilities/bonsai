package de.unibi.citec.clf.bonsai.gui.grapheditor.window

import de.unibi.citec.clf.bonsai.gui.grapheditor.utils.BonsaiGraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.utils.BonsaiGraphInputGesture
import javafx.beans.property.DoubleProperty
import javafx.beans.property.SimpleDoubleProperty
import javafx.collections.ObservableList
import javafx.event.Event
import javafx.event.EventHandler
import javafx.geometry.HPos
import javafx.geometry.Orientation
import javafx.geometry.Point2D
import javafx.geometry.Pos
import javafx.geometry.VPos
import javafx.scene.Cursor
import javafx.scene.Node
import javafx.scene.control.ScrollBar
import javafx.scene.input.MouseEvent
import javafx.scene.input.ScrollEvent
import javafx.scene.input.ZoomEvent
import javafx.scene.layout.Region
import javafx.scene.shape.Rectangle
import javafx.scene.transform.Scale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

open class PanningWindow: Region() {

    companion object{
        const val SCALE_MIN: Double = 0.5
        const val SCALE_MAX: Double = 1.5

        fun constrainZoom(pZoom: Double): Double {
            val zoom: Double = round(pZoom * 100.0) / 100.0
            if (zoom <= 1.02 && zoom >= 0.98) return 1.0
            return min(max(zoom, SCALE_MIN), SCALE_MAX)
        }
    }

    private var content: Region? = null
        set(value) {
            val prevContent: Region? = content
            prevContent?.let {
                removeMouseHandlersFromContent(prevContent)
                children?.remove(prevContent)
                prevContent.transforms.remove(scale)
            }
            content = value
            value?.let {
                value.isManaged = false
                children?.add(value)
                addMouseHandlersToContent(value)
                value.transforms.add(scale)
                scrollX.isVisible = true
                scrollY.isVisible = true
            } ?: {
                scrollX.isVisible = false
                scrollY.isVisible = false
            }
        }

    private val _contentX = object: SimpleDoubleProperty() {
        override fun invalidated() {
            requestLayout()
        }
    }
    var contentX: Double
        get() = _contentX.get()
        set(value) = _contentX.set(value)

    private val _contentY = object : SimpleDoubleProperty() {
        override fun invalidated() {
            requestLayout()
        }
    }
    var contentY: Double
        get() = _contentY.get()
        set(value) = _contentY.set(value)

    private val scrollX: ScrollBar = ScrollBar()
    private val scrollY: ScrollBar = ScrollBar()

    private val mousePressedHandler: EventHandler<MouseEvent> = this::handlePanningMousePressed
    private val mouseDraggedHandler: EventHandler<MouseEvent> = this::handlePanningMouseDragged
    private val mouseReleasedHandler: EventHandler<MouseEvent> = this::handlePanningMouseReleased

    private val zoomHandler: EventHandler<ZoomEvent> = this::handleZoom
    private val scrollHandler: EventHandler<ScrollEvent> = this::handleScroll

    private lateinit var clickPosition: Point2D
    private lateinit var windowPosAtClick: Point2D

    private val _zoom: DoubleProperty = SimpleDoubleProperty()
    private var zoom: Double
        get() = _zoom.get()
        set(value) = _zoom.set(value)
    private val scale: Scale = Scale()

    private var properties: BonsaiGraphEditorProperties? = null

    init {
        val tmpClip = Rectangle()
        tmpClip.widthProperty().bind(widthProperty())
        tmpClip.heightProperty().bind(heightProperty())
        clip = tmpClip

        scale.xProperty().bind(_zoom)
        scale.yProperty().bind(_zoom)

        children?.addAll(scrollX, scrollY)

        scrollX.orientation = Orientation.HORIZONTAL
        scrollX.valueProperty().bindBidirectional(_contentX)

        scrollY.orientation = Orientation.VERTICAL
        scrollY.valueProperty().bindBidirectional(_contentY)
    }

    private fun panTo(x: Double, y: Double) {
        panToX(x)
        panToY(y)
    }

    private fun canNotPanX(): Boolean {
        return (content?.width ?: 0.0) < width
    }

    private fun canNotPanY(): Boolean {
        return (content?.height ?: 0.0) < height
    }

    private fun panToX(x: Double) {
        if (canNotPanX()) return
        val newX: Double = checkContentX(x)
        if (newX != contentX) contentX = newX
    }

    private fun panToY(y: Double) {
        if (canNotPanY()) return
        val newY: Double = checkContentY(y)
        if (newY != contentY) contentY = newY
    }

    fun panTo(position: Pos) {
        contentX = when(position.hpos) {
            HPos.LEFT -> 0.0
            HPos.CENTER -> (content!!.width - width) / 2
            HPos.RIGHT -> content!!.width - width
        }
        contentY = when(position.vpos) {
            VPos.TOP -> 0.0
            VPos.CENTER -> (content!!.height - height) / 2
            VPos.BASELINE -> return
            VPos.BOTTOM -> content!!.height - height
        }
        checkWindowBounds()
    }

    fun setZoomAt(pZoom: Double, pivotX: Double, pivotY: Double) {
        val oldZoomLevel: Double = zoom
        val newZoomLevel: Double = constrainZoom(pZoom)

        if (newZoomLevel != oldZoomLevel) {
            val f: Double = newZoomLevel / oldZoomLevel - 1
            zoom = newZoomLevel
            panTo(contentX + f * pivotX, contentY + f * pivotY)
        }
    }

    override fun layoutChildren() {
        super.layoutChildren()
        content?.relocate(-contentX, -contentY)

        val w: Double = scrollY.width
        val h: Double = scrollX.height

        scrollX.resizeRelocate(0.0, snapPositionY(height - h), snapSizeX(width - w), h)
        scrollY.resizeRelocate(snapPositionX(width - w), 0.0, w, snapSizeY(height - h))

        val zoomFactor: Double = content?.localToSceneTransform?.mxx ?: 1.0
        scrollX.min = 0.0
        scrollX.max = getMaxX()
        scrollX.visibleAmount = zoomFactor * width
        scrollY.min = 0.0
        scrollY.max = getMaxY()
        scrollY.visibleAmount = zoomFactor * height
    }

    protected fun checkWindowBounds() {
        panTo(contentX, contentY)
    }

    private fun getMaxX(): Double {
        return content?.let {
            it.localToSceneTransform.mxx * it.width - width
        } ?: 0.0
    }

    private fun getMaxY(): Double {
        return content?.let {
            it.localToSceneTransform.mxx * it.height - height
        } ?: 0.0
    }

    private fun checkContentX(xToCheck: Double): Double {
        return snapPositionX(min(getMaxX(), max(xToCheck, 0.0)))
    }

    private fun checkContentY(yToCheck: Double): Double {
        return snapPositionY(min(getMaxY(), max(yToCheck, 0.0)))
    }

    override fun getChildren(): ObservableList<Node?>? {
        return super.getChildren()
    }

    private fun handlePanningMousePressed(event: MouseEvent) {
        properties?.let {
            if (it.activateGesture(BonsaiGraphInputGesture.PAN, event, this)) {
                startPanning(event.x, event.y)
            }
        }
    }

    protected fun handlePanningMouseReleased(event: MouseEvent) {
        handlePanningFinished(event)
    }

    private fun handlePanningMouseDragged(event: MouseEvent) {
        properties?.let {
            if (it.activateGesture(BonsaiGraphInputGesture.PAN, event, this)) {
                if (!Cursor.MOVE.equals(cursor)) {
                    startPanning(event.x, event.y)
                }
                val deltaX: Double = event.screenX - clickPosition.x
                val deltaY: Double = event.screenY - clickPosition.y

                val newWindowX: Double = windowPosAtClick.x - deltaX
                val newWindowY: Double = windowPosAtClick.y - deltaY

                panTo(newWindowX, newWindowY)
            }
        }
    }

    private fun handlePanningFinished(event: Event) {
        properties?.let {
            if (it.finishGesture(BonsaiGraphInputGesture.PAN, this)) {
                cursor = null
                event.consume()
            }
        }
    }

    private fun handleScroll(event: ScrollEvent) {
        if (event.isDirect || event.touchCount > 0 || properties == null) {
            return
        }
        properties?.let {
            if (it.activateGesture(BonsaiGraphInputGesture.ZOOM, event, this)) {
                try {
                    val modifier: Double = if (event.deltaY > 1) 0.06 else -0.06
                    setZoomAt(zoom + modifier, event.x, event.y)
                    event.consume()
                } finally {
                    it.finishGesture(BonsaiGraphInputGesture.ZOOM, this)
                }
            } else if (it.activateGesture(BonsaiGraphInputGesture.PAN, event, this)) {
                try {
                    panTo(contentX - event.deltaX, contentY - event.deltaY)
                    event.consume()
                } finally {
                    it.finishGesture(BonsaiGraphInputGesture.PAN, this)
                }
            }
        }
    }

    private fun handleZoom(event: ZoomEvent) {
        properties?.let {
            if (event.eventType == ZoomEvent.ZOOM_STARTED && it.activateGesture(BonsaiGraphInputGesture.ZOOM, event, this)) {
                event.consume()
            } else if (event.eventType == ZoomEvent.ZOOM_FINISHED && it.finishGesture(BonsaiGraphInputGesture.ZOOM, this)) {
                event.consume()
            } else if (event.eventType == ZoomEvent.ZOOM && it.activateGesture(BonsaiGraphInputGesture.ZOOM, event, this)) {
                val newZoomLevel: Double = zoom * event.zoomFactor
                setZoomAt(newZoomLevel, event.x, event.y)
                event.consume()
            }
        } ?: return
    }

    private fun addMouseHandlersToContent(content: Node) {
        content.let {
            addEventHandler(MouseEvent.MOUSE_PRESSED, mousePressedHandler)
            addEventHandler(MouseEvent.MOUSE_DRAGGED, mouseDraggedHandler)
            addEventHandler(MouseEvent.MOUSE_RELEASED, mouseReleasedHandler)
            addEventHandler(MouseEvent.MOUSE_CLICKED, mouseReleasedHandler)
            addEventHandler(ZoomEvent.ANY, zoomHandler)
            addEventHandler(ScrollEvent.SCROLL, scrollHandler)
        }

    }

    private fun removeMouseHandlersFromContent(content: Node) {
        content.let {
            removeEventHandler(MouseEvent.MOUSE_PRESSED, mousePressedHandler)
            removeEventHandler(MouseEvent.MOUSE_DRAGGED, mouseDraggedHandler)
            removeEventHandler(MouseEvent.MOUSE_RELEASED, mouseReleasedHandler)
            removeEventHandler(MouseEvent.MOUSE_CLICKED, mouseReleasedHandler)
            removeEventHandler(ZoomEvent.ANY, zoomHandler)
            removeEventHandler(ScrollEvent.SCROLL, scrollHandler)
        }

    }

    private fun startPanning(x: Double, y: Double) {
        cursor = Cursor.MOVE
        clickPosition = Point2D(x,y)
        windowPosAtClick = Point2D(contentX, contentY)
    }
}