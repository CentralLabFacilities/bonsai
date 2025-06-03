package de.unibi.citec.clf.bonsai.gui.grapheditor.api.window

import javafx.beans.InvalidationListener
import javafx.event.ActionEvent
import javafx.event.EventHandler
import javafx.scene.control.Hyperlink
import javafx.scene.input.MouseButton
import javafx.scene.input.MouseEvent
import javafx.scene.layout.*
import javafx.scene.paint.Color
import javafx.scene.shape.StrokeLineCap
import javafx.scene.shape.StrokeLineJoin
import javafx.scene.shape.StrokeType
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

/**
 * A minimap that displays the current position of a {@link PanningWindow}
 * relative to its content.
 *
 * <p>
 * Also provides mechanisms for navigating the window to other parts of the
 * content by clicking or dragging.
 * </p>
 */
open class PanningWindowMinimap : Pane() {

    companion object {
        val MINIMAP_PADDING: Double = 5.0
        private const val STYLE_CLASS = "minimap"
    }

    private val locator: MinimapLocator = MinimapLocator(MINIMAP_PADDING)
    private var contentRepresentation: MinimapNodeGroup? = null
    var window: PanningWindow? = null
        set(value) {
            field?.widthProperty()?.removeListener(drawListener)
            field?.heightProperty()?.removeListener(drawListener)
            field = value
            field?.widthProperty()?.addListener(drawListener)
            field?.heightProperty()?.addListener(drawListener)
            requestLayout()
        }
    var content: Region? = null
        set(value) {
            field.let {
                layoutXProperty().removeListener(drawListener)
                layoutYProperty().removeListener(drawListener)
                widthProperty().removeListener(drawListener)
                heightProperty().removeListener(drawListener)
                localToSceneTransformProperty().removeListener(drawListener)
            }
            field = value
            field.let {
                layoutXProperty().addListener(drawListener)
                layoutYProperty().addListener(drawListener)
                widthProperty().addListener(drawListener)
                heightProperty().addListener(drawListener)
                localToSceneTransformProperty().addListener(drawListener)
            }
            requestLayout()
        }
    private val drawListener: InvalidationListener = InvalidationListener { requestLayout() }
    private var locatorPositionListenersMuted: Boolean = false
    private var drawLocatorListenerMuted: Boolean = false

    private val zoomIn: Hyperlink = Hyperlink("++")
    private val zoomOut: Hyperlink = Hyperlink("--")
    private val zoomExact: Hyperlink = Hyperlink("1:1")

    init {
        styleClass.add(STYLE_CLASS)

        isPickOnBounds = false

        createLocatorPositionListeners()
        createMinimapClickHandlers()

        children.add(locator)

        zoomOut.styleClass.addAll("zoom", "zoom-out")
        zoomIn.styleClass.addAll("zoom", "zoom-in")
        zoomExact.styleClass.addAll("zoom", "zoom-exact")

        zoomOut.onAction = EventHandler { zoomOut(it) }
        zoomIn.onAction = EventHandler { zoomIn(it) }
        zoomExact.onAction = EventHandler { zoomExact(it) }

        children.addAll(zoomIn, zoomOut, zoomExact)

        border = Border(BorderStroke(Color.valueOf("000000"), BorderStrokeStyle(
                StrokeType.INSIDE,
                StrokeLineJoin.MITER,
                StrokeLineCap.BUTT,
                10.0,
                0.0,
                null
        ), CornerRadii(0.0), BorderWidths(2.0)))
    }

    protected fun zoomIn(event: ActionEvent) {
        window?.let { it.zoom += 0.06 }
        event.consume()
    }

    protected fun zoomExact(event: ActionEvent) {
        window?.zoom = 1.0
        event.consume()
    }

    protected fun zoomOut(event: ActionEvent) {
        window?.let { it.zoom -= 0.06 }
        event.consume()
    }

    /**
     * Sets the content representation to be displayed in this minimap.
     *
     * @param pContentRepresentation
     *            a {@link MinimapNodeGroup} to be displayed
     */
    open fun setContentRepresentation(pContentRepresentation: MinimapNodeGroup) {
        contentRepresentation?.let {
            children.remove(contentRepresentation)
        }
        contentRepresentation = pContentRepresentation
        contentRepresentation.let {
            children.add(0, pContentRepresentation)
        }
    }

    /**
     * Calculates the scale factor that indicates how much smaller the minimap
     * is than the content it is representing.
     *
     * <p>
     * This number should be greater than 0 and probably much less than 1.
     * </p>
     *
     * @return the ratio of the minimap size to the content size
     */
    protected fun calculateScaleFactor(): Double {
        return content?.let {
            val scaleFactorX: Double = (width - 2 * MINIMAP_PADDING) / it.width
            val scaleFactorY: Double = (height - 2 * MINIMAP_PADDING) / it.height
            min(scaleFactorX, scaleFactorY)
        } ?: 1.0
    }

    override fun layoutChildren() {
        super.layoutChildren()

        val scaleFactor: Double = calculateScaleFactor()

        if (checkContentExists() && checkWindowExists() && contentRepresentation != null) {
            contentRepresentation!!.relocate(MINIMAP_PADDING, MINIMAP_PADDING)
            contentRepresentation!!.scaleFactor = scaleFactor
            contentRepresentation!!.resize(width - MINIMAP_PADDING * 2, height - MINIMAP_PADDING * 2)
        }

        val maxLocWidth: Double = width - MINIMAP_PADDING * 2
        val maxLocHeight: Double = height - MINIMAP_PADDING * 2

        if (!drawLocatorListenerMuted) {
            locatorPositionListenersMuted = true

            val zoomFactor: Double = calculateScaleFactor()
            val x: Double = max(0.0, content?.let { round(-it.layoutX * scaleFactor / zoomFactor) } ?: 0.0)
            val y: Double = max(0.0, content?.let { round(-it.layoutY * scaleFactor / zoomFactor) } ?: 0.0)
            val locWidth: Double = min(maxLocWidth, round(window!!.width * scaleFactor / zoomFactor))
            val locHeight: Double = min(maxLocHeight, round(window!!.height * scaleFactor / zoomFactor))

            locator.resizeRelocate(x + MINIMAP_PADDING, y + MINIMAP_PADDING, locWidth, locHeight)
            locatorPositionListenersMuted = false
        }
        zoomOut.relocate(MINIMAP_PADDING, height - zoomOut.height)
        zoomIn.relocate(maxLocWidth - zoomIn.width, height - zoomOut.height)
        zoomExact.relocate(maxLocWidth / 2 - zoomExact.width / 2, height - zoomOut.height)
    }

    protected fun createLocatorPositionListeners() {
        locator.layoutXProperty().addListener { _, _, newValue ->
            if (!locatorPositionListenersMuted && checkContentExists() && checkWindowExists()) {
                drawLocatorListenerMuted = true
                val effectiveScaleFactor = calculateScaleFactor() / calculateZoomFactor()
                val targetX = (newValue.toDouble() - MINIMAP_PADDING) / effectiveScaleFactor
                window?.panToX(targetX)
                drawLocatorListenerMuted = false
            }
        }
        locator.layoutYProperty().addListener { _, _, newValue ->
            if (!locatorPositionListenersMuted && checkContentExists() && checkWindowExists()) {
                drawLocatorListenerMuted = true
                val effectiveScaleFactor = calculateScaleFactor() / calculateZoomFactor()
                val targetY = (newValue.toDouble() - MINIMAP_PADDING) / effectiveScaleFactor
                window?.panToY(targetY)
                drawLocatorListenerMuted = false
            }
        }
    }

    protected fun createMinimapClickHandlers() {
        onMousePressed = EventHandler { event ->
            if (!checkReadyForClickEvent(event)) return@EventHandler

            val x = event.x - MINIMAP_PADDING - locator.width / 2
            val y = event.y - MINIMAP_PADDING - locator.height / 2

            val zoomFactor = calculateZoomFactor()

            window?.panTo(x / calculateScaleFactor() * zoomFactor, y / calculateScaleFactor() * zoomFactor)
        }
    }

    protected fun calculateZoomFactor(): Double {
        return content?.localToSceneTransform?.mxx ?: 1.0
    }

    protected fun checkReadyForClickEvent(event: MouseEvent): Boolean {
        return event.button == MouseButton.PRIMARY && checkContentExists() && checkWindowExists()
    }

    protected fun checkContentExists(): Boolean {
        return content?.let {
            it.height > 0 && it.height > 0
        } ?: false
    }

    protected fun checkWindowExists(): Boolean {
        return window?.let {
            it.height > 0 && it.width > 0
        } ?: false
    }

}