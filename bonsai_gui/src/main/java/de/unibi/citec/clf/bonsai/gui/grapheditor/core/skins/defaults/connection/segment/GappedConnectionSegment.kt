package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.segment

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import javafx.geometry.Point2D
import javafx.scene.shape.MoveTo

class GappedConnectionSegment(start: Point2D, end: Point2D, intersections: MutableList<Double>): ConnectionSegment(start, end, intersections) {

    companion object {
        private const val GAP_SIZE = 4
    }

    override fun drawToFirstIntersection(intersection: Double) {
        if (horizontal) {
            addHLineTo(intersection - sign * GAP_SIZE)
            addHGapTo(intersection + sign * GAP_SIZE)
        } else {
            addVLineTo(intersection - sign * GAP_SIZE)
            addVGapTo(intersection + sign * GAP_SIZE)
        }
    }

    override fun drawBetweenIntersections(intersection: Double, lastIntersection: Double) {
        if (sign * (intersection - lastIntersection) > 2 * GAP_SIZE) {
            if (horizontal) {
                addHLineTo(intersection - sign * GAP_SIZE)
            } else {
                addVLineTo(intersection - sign * GAP_SIZE)
            }
        }

        if (horizontal) {
            addHGapTo(intersection + sign * GAP_SIZE)
        } else {
            addVGapTo(intersection + sign * GAP_SIZE)
        }
    }

    override fun drawFromLastIntersection(intersection: Double) {
        if (horizontal) {
            addHLineTo(end.x)
        } else {
            addVLineTo(end.y)
        }
    }

    private fun addHGapTo(x: Double) {
        pathElements.add(MoveTo(GeometryUtils.moveOffPixel(x), GeometryUtils.moveOffPixel(start.y)))
    }

    private fun addVGapTo(y: Double) {
        pathElements.add(MoveTo(GeometryUtils.moveOffPixel(start.x), GeometryUtils.moveOffPixel(y)))
    }

}