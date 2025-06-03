package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GTailSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.Arrow
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree.ArrowUtils.draw
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.geometry.Point2D
import javafx.scene.Node

/**
 * Tail skin for the 'tree-like' graph. Pretty much just an arrow.
 */
class TreeTailSkin(connector: GConnector?) : GTailSkin(connector!!) {
    private val arrow = Arrow()

    init {
        arrow.styleClass.add(STYLE_CLASS)
    }

    override val root: Node
        get() = arrow

    override fun draw(start: Point2D?, end: Point2D?) {
        drawArrow(start, end)
    }

    override fun draw(start: Point2D?, end: Point2D?, jointPositions: List<Point2D>?) {
        drawArrow(start, end)
    }

    override fun draw(start: Point2D?, end: Point2D?, target: GConnector, valid: Boolean) {
        drawArrow(start, end)
    }

    override fun draw(start: Point2D?, end: Point2D?, jointPositions: List<Point2D>?,
                      target: GConnector, valid: Boolean) {
        drawArrow(start, end)
    }

    override fun allocateJointPositions(): List<Point2D> {
        return ArrayList()
    }

    override fun selectionChanged(isSelected: Boolean) {
        // Not implemented
    }

    /**
     * Draws an arrow from the start to end point.
     *
     * @param start the start point of the arrow
     * @param end the end point (tip) of the arrow
     */
    private fun drawArrow(start: Point2D?, end: Point2D?) {
        if (item!!.type == TreeSkinConstants.TREE_OUTPUT_CONNECTOR) {
            draw(arrow, start!!, end!!, OFFSET_DISTANCE)
        } else {
            draw(arrow, end!!, start!!, OFFSET_DISTANCE)
        }
    }

    companion object {
        private const val STYLE_CLASS = "tree-tail" //$NON-NLS-1$
        private const val OFFSET_DISTANCE = 15.0
    }
}