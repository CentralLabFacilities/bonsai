package de.unibi.citec.clf.bonsai.gui.grapheditor.api.window

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphInputGesture
import javafx.beans.property.DoubleProperty
import javafx.beans.property.SimpleDoubleProperty
import javafx.collections.ObservableList
import javafx.event.Event
import javafx.event.EventHandler
import javafx.geometry.*
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


/**
 * A window over a large {@link Region} of content.
 *
 * <p>
 * This window can be panned around relative to its content. Only the parts of
 * the content that are inside the window will be rendered. Everything outside
 * it is clipped.
 * </p>
 */
open class PanningWindow : Region() {

    companion object {
        protected const val SCALE_MIN: Double = 0.5
        protected const val SCALE_MAX: Double = 1.5

        fun constrainZoom(pZoom: Double): Double {
            val zoom: Double = round(pZoom * 100.0) / 100.0
            if (zoom <= 1.02 && zoom >= 0.98) return 1.0
            return min(max(zoom, SCALE_MIN), SCALE_MAX)
        }
    }

    protected var content: Region? = null
        set(value) {
            val prevContent: Region? = field
            prevContent?.let {
                removeMouseHandlersFromContent(prevContent)
                children?.remove(prevContent)
                prevContent.transforms.remove(scale)
            }
            field = value
            field?.let {
                it.isManaged = false
                children?.add(value)
                addMouseHandlersToContent(it)
                it.transforms.add(scale)
                scrollX.isVisible = true
                scrollY.isVisible = true
            } ?: {
                scrollX.isVisible = false
                scrollY.isVisible = false
            }
        }

    private val _contentX = object : SimpleDoubleProperty() {
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

    private val mousePressedHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> {
        if (properties.activateGesture(GraphInputGesture.PAN, it, this)) {
            startPanning(it.screenX, it.screenY)
        }
    }

    private val mouseDraggedHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> {
        if (properties.activateGesture(GraphInputGesture.PAN, it, this) ?: false) {
            if (!Cursor.MOVE.equals(cursor)) {
                startPanning(it.x, it.y)
            }
            val deltaX: Double = it.screenX - clickPosition.x
            val deltaY: Double = it.screenY - clickPosition.y

            val newWindowX: Double = windowPosAtClick.x - deltaX
            val newWindowY: Double = windowPosAtClick.y - deltaY

            panTo(newWindowX, newWindowY)
        }
    }

    private val mouseReleasedHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> {
        handlePanningFinished(it)
    }

    open fun handlePanningMouseReleased(event: MouseEvent) {
        handlePanningFinished(event)
    }

    private val zoomHandler: EventHandler<ZoomEvent> = EventHandler<ZoomEvent> {
        if (it.eventType == ZoomEvent.ZOOM_STARTED && properties.activateGesture(
                GraphInputGesture.ZOOM,
                it,
                this
            )
        ) {
            it.consume()
        } else if (it.eventType == ZoomEvent.ZOOM_FINISHED && properties.finishGesture(
                GraphInputGesture.ZOOM,
                this
            )
        ) {
            it.consume()
        } else if (it.eventType == ZoomEvent.ZOOM && properties.activateGesture(
                GraphInputGesture.ZOOM,
                it,
                this
            )
        ) {
            val newZoomLevel: Double = zoom * it.zoomFactor
            setZoomAt(newZoomLevel, it.x, it.y)
            it.consume()
        }
    }

    private val scrollHandler: EventHandler<ScrollEvent> = EventHandler<ScrollEvent> {
        if (it.isDirect || it.touchCount > 0) {
            return@EventHandler
        }
        if (properties.activateGesture(GraphInputGesture.ZOOM, it, this)) {
            try {
                val modifier: Double = if (it.deltaY > 1) 0.06 else -0.06
                setZoomAt(zoom + modifier, it.x, it.y)
                it.consume()
            } finally {
                properties.finishGesture(GraphInputGesture.ZOOM, this)
            }
        } else if (properties.activateGesture(GraphInputGesture.PAN, it, this)) {
            try {
                panTo(contentX - it.deltaX, contentY - it.deltaY)
                it.consume()
            } finally {
                properties.finishGesture(GraphInputGesture.PAN, this)
            }
        }

    }

    private lateinit var clickPosition: Point2D
    private lateinit var windowPosAtClick: Point2D

    private val _zoom: DoubleProperty = SimpleDoubleProperty()
    var zoom: Double
        get() = _zoom.get()
        set(value) = _zoom.set(value)
    private val scale: Scale = Scale()

    lateinit var properties: GraphEditorProperties

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

    /**
     * Pans the window to the specified x and y coordinates.
     *
     * <p>
     * The window cannot be panned outside the content. When the window 'hits
     * the edge' of the content it will stop.
     * </p>
     *
     * @param x
     *            the x position of the window relative to the top-left corner
     *            of the content
     * @param y
     *            the y position of the window relative to the top-left corner
     *            of the content
     */
    fun panTo(x: Double, y: Double) {
        panToX(x)
        panToY(y)
    }

    /**
     * If there is no content at all or the content X is smaller than the outer window we do not need to pan at all
     *
     * @return {@code true} if the window should not be panned at all or {@code false} if the window can be panned
     */
    private fun canNotPanX(): Boolean {
        return (content?.width ?: 0.0) < width
    }

    /**
     * If there is no content at all or the content is smaller than the outer window we do not need to pan at all
     *
     * @return {@code true} if the window should not be panned at all or {@code false} if the window can be panned
     */
    private fun canNotPanY(): Boolean {
        return (content?.height ?: 0.0) < height
    }

    /**
     * Pans the window to the specified x coordinate.
     *
     * <p>
     * The window cannot be panned outside the content. When the window 'hits
     * the edge' of the content it will stop.
     * </p>
     *
     * @param x
     *            the x position of the window relative to the top-left corner
     *            of the content
     */
    fun panToX(x: Double) {
        if (canNotPanX()) return
        val newX: Double = checkContentX(x)
        if (newX != contentX) contentX = newX
    }

    /**
     * Pans the window to the specified x coordinate.
     *
     * <p>
     * The window cannot be panned outside the content. When the window 'hits
     * the edge' of the content it will stop.
     * </p>
     *
     * @param y
     *            the y position of the window relative to the top-left corner
     *            of the content
     */
    fun panToY(y: Double) {
        if (canNotPanY()) return
        val newY: Double = checkContentY(y)
        if (newY != contentY) contentY = newY
    }

    /**
     * Pans the window to the given position.
     *
     * <p>
     * <b>Note: </b><br>
     * The current width and height values of the window and its content are used in
     * this method. It should therefore be called <em>after</em> the scene has been
     * drawn.
     * </p>
     *
     * @param position the {@link Pos} to pan to
     */
    fun panTo(position: Pos) {
        contentX = when (position.hpos) {
            HPos.LEFT -> 0.0
            HPos.CENTER -> (content!!.width - width) / 2
            HPos.RIGHT -> content!!.width - width
        }
        contentY = when (position.vpos) {
            VPos.TOP -> 0.0
            VPos.CENTER -> (content!!.height - height) / 2
            VPos.BASELINE -> return
            VPos.BOTTOM -> content!!.height - height
        }
        checkWindowBounds()
    }

    /**
     * Zoom at the given location
     *
     * @param pZoom
     *            new zoom factor
     * @param pivotX
     *            the X coordinate about which point the scale occurs
     * @param pivotY
     *            the Y coordinate about which point the scale occurs
     */
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

    /**
     * Checks that the window bounds are completely inside the content bounds,
     * and repositions if necessary.
     *
     * <p>
     * Also checks that the window position values are integers to ensure
     * strokes are drawn cleanly.
     * </p>
     */
    protected fun checkWindowBounds() {
        panTo(contentX, contentY)
    }

    protected fun getMaxX(): Double {
        return content?.let {
            it.localToSceneTransform.mxx * it.width - width
        } ?: 0.0
    }

    protected fun getMaxY(): Double {
        return content?.let {
            it.localToSceneTransform.mxx * it.height - height
        } ?: 0.0
    }

    protected fun checkContentX(xToCheck: Double): Double {
        return snapPositionX(min(getMaxX(), max(xToCheck, 0.0)))
    }

    protected fun checkContentY(yToCheck: Double): Double {
        return snapPositionY(min(getMaxY(), max(yToCheck, 0.0)))
    }

    override fun getChildren(): ObservableList<Node?>? {
        return super.getChildren()
    }

    protected fun handlePanningFinished(event: Event) {
            if (properties.finishGesture(GraphInputGesture.PAN, this)) {
                cursor = null
                event.consume()
            }
    }

    /**
     * Adds handlers to the content for panning and zooming.
     */
    protected fun addMouseHandlersToContent(content: Node) {
        content.let {
            addEventHandler(MouseEvent.MOUSE_PRESSED, mousePressedHandler)
            addEventHandler(MouseEvent.MOUSE_DRAGGED, mouseDraggedHandler)
            addEventHandler(MouseEvent.MOUSE_RELEASED, mouseReleasedHandler)
            addEventHandler(MouseEvent.MOUSE_CLICKED, mouseReleasedHandler)
            addEventHandler(ZoomEvent.ANY, zoomHandler)
            addEventHandler(ScrollEvent.SCROLL, scrollHandler)
        }

    }

    /**
     * Removes existing handlers from the content, if possible.
     */
    protected fun removeMouseHandlersFromContent(content: Node) {
        content.let {
            removeEventHandler(MouseEvent.MOUSE_PRESSED, mousePressedHandler)
            removeEventHandler(MouseEvent.MOUSE_DRAGGED, mouseDraggedHandler)
            removeEventHandler(MouseEvent.MOUSE_RELEASED, mouseReleasedHandler)
            removeEventHandler(MouseEvent.MOUSE_CLICKED, mouseReleasedHandler)
            removeEventHandler(ZoomEvent.ANY, zoomHandler)
            removeEventHandler(ScrollEvent.SCROLL, scrollHandler)
        }

    }

    /**
     * Starts panning. Should be called on mouse-pressed or when a drag event
     * occurs without a pressed event having been registered. This can happen if
     * e.g. a context menu closes and consumes the pressed event.
     *
     * @param x
     *            the scene-x position of the cursor
     * @param y
     *            the scene-y position of the cursor
     */
    protected fun startPanning(x: Double, y: Double) {
        cursor = Cursor.MOVE
        clickPosition = Point2D(x, y)
        windowPosAtClick = Point2D(contentX, contentY)
    }
}