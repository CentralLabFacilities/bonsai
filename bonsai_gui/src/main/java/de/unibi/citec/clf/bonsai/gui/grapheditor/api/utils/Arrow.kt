package de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils

import javafx.geometry.Point2D
import javafx.scene.Group
import javafx.scene.shape.Line
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * An arrow shape.
 *
 * <p>
 * This is a {@link Node} subclass and can be added to the JavaFX scene graph in
 * the usual way. Styling can be achieved via the CSS classes
 * <em>arrow-line</em> and <em>arrow-head</em>.
 * <p>
 *
 * <p>
 * Example:
 *
 * <pre>
 * <code>arrow: Arrow = Arrow()
 * arrow.setStart(10.0, 20.0)
 * arrow.setEnd(100.0, 150.0)
 * arrow.draw()</code>
 * </pre>
 *
 * </p>
 *
 */
class Arrow : Group() {

    val line: Line = Line()
    val head: ArrowHead = ArrowHead()

    private var startX = 0.0
    private var startY = 0.0

    private var endX = 0.0
    private var endY = 0.0

    init {
        line.styleClass.add(STYLE_CLASS_LINE)
        head.styleClass.add(STYLE_CLASS_HEAD)

        children.addAll(line, head)
    }

    fun getStart(): Point2D {
        return Point2D(startX, startY)
    }

    fun setStart(x: Double, y: Double) {
        startX = x
        startY = y
    }

    fun getEnd(): Point2D {
        return Point2D(endX ,endY)
    }

    fun setEnd(x: Double, y: Double) {
        endX = x
        endY = y
    }

    fun draw() {
        val deltaX = endX - startX
        val deltaY = endY - startY

        val angle = atan2(deltaX, deltaY)

        val headX = endX - head.length / 2 * sin(angle)
        val headY = endY - head.length / 2 * cos(angle)

        line.startX = GeometryUtils.moveOffPixel(startX)
        line.startY = GeometryUtils.moveOffPixel(startY)
        line.endX = GeometryUtils.moveOffPixel(endX)
        line.endY = GeometryUtils.moveOffPixel(endY)

        head.setCenter(headX, headY)
        head.rotate.angle = Math.toDegrees(-angle)
        head.draw()
    }

    companion object {
        const val STYLE_CLASS_LINE: String = "arrow-line"
        const val STYLE_CLASS_HEAD: String = "arrow-head"
    }
}