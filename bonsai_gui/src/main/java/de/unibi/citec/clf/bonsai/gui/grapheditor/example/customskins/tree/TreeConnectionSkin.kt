package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectionSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GJointSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.Arrow
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils.moveOffPixel
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree.ArrowUtils.draw
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import javafx.event.EventHandler
import javafx.geometry.Point2D
import javafx.scene.Group
import javafx.scene.Node
import javafx.scene.input.MouseEvent
import javafx.scene.shape.Line
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * Connection skin for the 'tree-like' graph. Pretty much just an arrow.
 */
class TreeConnectionSkin(connection: GConnection?) : GConnectionSkin(connection!!) {
    private val arrow = Arrow()
    private val background = Arrow()
    private val haloFirstSide = Line()
    private val haloSecondSide = Line()
    private val selectionHalo = Group(haloFirstSide, haloSecondSide)

    override val root = Group(background, selectionHalo, arrow)

    /**
     * Creates a new [TreeConnectionSkin] instance.
     *
     * @param connection the [GConnection] that this skin is representing
     */
    init {
        arrow.isManaged = false
        arrow.styleClass.setAll(STYLE_CLASS)
        background.isManaged = false
        background.styleClass.setAll(STYLE_CLASS_BACKGROUND)
        root.onMousePressed = EventHandler { event: MouseEvent -> handleMousePressed(event) }
        root.onMouseDragged = EventHandler { event: MouseEvent -> handleMouseDragged(event) }
        haloFirstSide.styleClass.add(STYLE_CLASS_SELECTION_HALO)
        haloSecondSide.styleClass.add(STYLE_CLASS_SELECTION_HALO)
        selectionHalo.isVisible = false
    }

    override fun setJointSkins(jointSkins: List<GJointSkin>) {
        // This skin is not intended to show joints.
    }

    override fun draw(allConnections: Map<GConnectionSkin, List<Point2D>>) {
        val points: List<Point2D>? = allConnections[this]
        if (points != null && points.size == 2) {
            val start = points[0]
            val end = points[1]
            if (item!!.source.type == TreeSkinConstants.TREE_OUTPUT_CONNECTOR) {
                draw(arrow, start, end, OFFSET_FROM_CONNECTOR)
                draw(background, start, end, OFFSET_FROM_CONNECTOR)
            } else {
                draw(arrow, end, start, OFFSET_FROM_CONNECTOR)
                draw(background, start, end, OFFSET_FROM_CONNECTOR)
            }
        }
        if (selected) {
            drawSelectionHalo()
        }
    }

    /**
     * Handles mouse-pressed events on the connection skin to select / de-select the connection.
     *
     * @param event the mouse-pressed event
     */
    private fun handleMousePressed(event: MouseEvent) {
        val editor = graphEditor ?: return
        if (event.isShortcutDown) {
            if (selected) {
                editor.selectionManager.clearSelection(item!!)
            } else {
                editor.selectionManager.select(item!!)
            }
        } else if (!selected) {
            graphEditor!!.selectionManager.clearSelection()
            editor.selectionManager.select(item!!)
        }
        event.consume()
    }

    /**
     * Handles mouse-dragged events on the connection skin. Consumes the event so it doesn't reach the view.
     *
     * @param event the mouse-dragged event
     */
    private fun handleMouseDragged(event: MouseEvent) {
        event.consume()
    }

    override fun selectionChanged(selected: Boolean) {
        selectionHalo.isVisible = selected
        if (selected) {
            drawSelectionHalo()
        }
    }

    /**
     * Draws the 'selection halo' that indicates that the connection is selected.
     */
    private fun drawSelectionHalo() {
        val arrowStart = arrow.getStart()
        val arrowEnd = arrow.getEnd()
        val deltaX = arrowEnd.x - arrowStart.x
        val deltaY = arrowEnd.y - arrowStart.y
        val angle = atan2(deltaX, deltaY)
        val breadthOffsetX = HALO_BREADTH_OFFSET * cos(angle)
        val breadthOffsetY = HALO_BREADTH_OFFSET * sin(angle)
        val lengthOffsetStartX = HALO_LENGTH_OFFSET_START * sin(angle)
        val lengthOffsetStartY = HALO_LENGTH_OFFSET_START * cos(angle)
        val lengthOffsetEndX = HALO_LENGTH_OFFSET_END * sin(angle)
        val lengthOffsetEndY = HALO_LENGTH_OFFSET_END * cos(angle)
        haloFirstSide.startX = moveOffPixel(arrowStart.x - breadthOffsetX + lengthOffsetStartX)
        haloFirstSide.startY = moveOffPixel(arrowStart.y + breadthOffsetY + lengthOffsetStartY)
        haloSecondSide.startX = moveOffPixel(arrowStart.x + breadthOffsetX + lengthOffsetStartX)
        haloSecondSide.startY = moveOffPixel(arrowStart.y - breadthOffsetY + lengthOffsetStartY)
        haloFirstSide.endX = moveOffPixel(arrowEnd.x - breadthOffsetX - lengthOffsetEndX)
        haloFirstSide.endY = moveOffPixel(arrowEnd.y + breadthOffsetY - lengthOffsetEndY)
        haloSecondSide.endX = moveOffPixel(arrowEnd.x + breadthOffsetX - lengthOffsetEndX)
        haloSecondSide.endY = moveOffPixel(arrowEnd.y - breadthOffsetY - lengthOffsetEndY)
    }

    companion object {
        private const val STYLE_CLASS = "tree-connection" //$NON-NLS-1$
        private const val STYLE_CLASS_BACKGROUND = "tree-connection-background" //$NON-NLS-1$
        private const val STYLE_CLASS_SELECTION_HALO = "tree-connection-selection-halo" //$NON-NLS-1$
        private const val OFFSET_FROM_CONNECTOR = 15.0
        private const val HALO_BREADTH_OFFSET = 5.0
        private const val HALO_LENGTH_OFFSET_START = 1.0
        private const val HALO_LENGTH_OFFSET_END = 12.0
    }
}