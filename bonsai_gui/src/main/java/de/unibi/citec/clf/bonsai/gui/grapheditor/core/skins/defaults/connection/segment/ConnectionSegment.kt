package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.segment

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import javafx.geometry.Point2D
import javafx.scene.shape.HLineTo
import javafx.scene.shape.PathElement
import javafx.scene.shape.VLineTo

abstract class ConnectionSegment(val start: Point2D, val end: Point2D, val intersections: MutableList<Double>) {

    companion object {
        private const val EDGE_OFFSET = 5
    }

    protected val horizontal: Boolean
    protected val sign: Int

    val pathElements: MutableList<PathElement> = mutableListOf()

    init {
        horizontal = start.y == end.y
        sign = if (horizontal) {
            if (start.x < end.x) 1 else -1
        } else {
            if (start.y < end.y) 1 else -1
        }
        filterIntersections()
    }

    fun draw() {
        if (intersections.isNotEmpty()) {
            drawToFirstIntersection(intersections[0])
            drawBetweenIntersections()
            drawFromLastIntersection(intersections[intersections.size - 1])
        } else {
            drawStraight()
        }
    }

    protected abstract fun drawToFirstIntersection(intersection: Double)

    protected abstract fun drawBetweenIntersections(intersection: Double, lastIntersection: Double)

    protected abstract fun drawFromLastIntersection(intersection: Double)

    protected fun addHLineTo(x: Double) {
        pathElements.add(HLineTo(GeometryUtils.moveOffPixel(x)))
    }

    protected fun addVLineTo(y: Double) {
        pathElements.add(VLineTo(GeometryUtils.moveOffPixel(y)))
    }

    private fun filterIntersections() {
        if (intersections.isEmpty()) return
        val intersectionsFiltered: MutableList<Double> = mutableListOf()
        for (intersection in intersections) {
            if (intersection != 0.0 && !isTooCloseToTheEdge(intersection)) {
                intersectionsFiltered.add(intersection)
            }
        }
        intersections.clear()
        intersections.addAll(intersectionsFiltered)
    }

    private fun isTooCloseToTheEdge(intersection: Double): Boolean {
        val startCoordinate = if (horizontal) start.x else start.y
        val endCoordinate = if (horizontal) end.x else end.y

        val tooCloseToStart = sign * (intersection - startCoordinate) < EDGE_OFFSET
        val tooCloseToEnd = sign * (endCoordinate - intersection) < EDGE_OFFSET

        return tooCloseToStart || tooCloseToEnd
    }

    private fun drawBetweenIntersections() {
        for (i in 1 until intersections.size) {
            drawBetweenIntersections(intersections[i], intersections[i-1])
        }
    }

    private fun drawStraight() {
        if (horizontal) {
            addHLineTo(end.x)
        } else {
            addVLineTo(end.y)
        }
    }

}