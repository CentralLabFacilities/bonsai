package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.segment

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import javafx.geometry.Point2D
import javafx.scene.shape.ArcTo

class DetouredConnectionSegment(start: Point2D, end: Point2D, intersections: MutableList<Double>): ConnectionSegment(start, end, intersections) {

    companion object {

        private const val DETOUR_RADIUS = 5.0
        private const val DETOUR_TOLERANCE = 20

    }

    override fun drawToFirstIntersection(intersection: Double) {
        if (horizontal) {
            if (sign * (intersection - start.x) > DETOUR_RADIUS) {
                addHLineTo(intersection - sign * DETOUR_RADIUS)
            }
            addArcTo(intersection, start.y - DETOUR_RADIUS)
        } else {
            if (sign * (intersection - start.y) > DETOUR_RADIUS) {
                addVLineTo(intersection - sign * DETOUR_RADIUS)
            }
            addArcTo(start.x + DETOUR_RADIUS, intersection)
        }
    }

    override fun drawBetweenIntersections(intersection: Double, lastIntersection: Double) {
        if (horizontal) {
            if (sign * (intersection - lastIntersection) <= DETOUR_TOLERANCE) {
                addHLineTo(intersection)
            } else {
                addArcTo(lastIntersection + sign * DETOUR_RADIUS, start.x)
                addHLineTo(intersection - sign * DETOUR_RADIUS)
                addArcTo(intersection, start.x - DETOUR_RADIUS)
            }
        } else {
            if (sign * (intersection - lastIntersection) <= DETOUR_TOLERANCE) {
                addVLineTo(intersection)
            } else {
                addArcTo(start.x, lastIntersection + sign * DETOUR_RADIUS)
                addVLineTo(intersection - sign * DETOUR_RADIUS)
                addArcTo(start.x + DETOUR_RADIUS, intersection)
            }
        }
    }

    override fun drawFromLastIntersection(intersection: Double) {
        if (horizontal) {
            addArcTo(intersection + sign * DETOUR_RADIUS, start.y)
            addHLineTo(end.x)
        } else {
            addArcTo(start.x, intersection + sign * DETOUR_RADIUS)
            addVLineTo(end.y)
        }
    }

    private fun addArcTo(x: Double, y: Double) {
        val arcTo = ArcTo()

        arcTo.radiusX = DETOUR_RADIUS
        arcTo.radiusY = DETOUR_RADIUS
        arcTo.isSweepFlag = sign > 0
        arcTo.x = GeometryUtils.moveOffPixel(x)
        arcTo.y = GeometryUtils.moveOffPixel(y)

        pathElements.add(arcTo)
    }

}