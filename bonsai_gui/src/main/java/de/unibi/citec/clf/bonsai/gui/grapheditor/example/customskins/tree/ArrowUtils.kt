package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.Arrow
import javafx.geometry.Point2D
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Utils for drawing arrows. Used by connection and tail skins.
 */
object ArrowUtils {
    /**
     * Draws the given arrow from the start to end points with the given offset from either end.
     *
     * @param arrow an [Arrow] to be drawn
     * @param start the start position
     * @param end the end position
     * @param offset an offset from start and end positions
     */
    fun draw(arrow: Arrow, start: Point2D, end: Point2D, offset: Double) {
        val deltaX = end.x - start.x
        val deltaY = end.y - start.y
        val angle = atan2(deltaX, deltaY)
        val startX = start.x + offset * sin(angle)
        val startY = start.y + offset * cos(angle)
        val endX = end.x - offset * sin(angle)
        val endY = end.y - offset * cos(angle)
        arrow.setStart(startX, startY)
        arrow.setEnd(endX, endY)
        arrow.draw()
        if (hypot(deltaX, deltaY) < 2 * offset) {
            arrow.isVisible = false
        } else {
            arrow.isVisible = true
        }
    }
}