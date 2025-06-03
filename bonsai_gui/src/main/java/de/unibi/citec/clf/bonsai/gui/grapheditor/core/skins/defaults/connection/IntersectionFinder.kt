package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectionSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.RectangularConnections
import javafx.geometry.Point2D

object IntersectionFinder {

    fun find(skin: GConnectionSkin, allPoints: Map<GConnectionSkin, List<Point2D>>, behind: Boolean): List<MutableList<Double>> {
        val points: List<Point2D> = allPoints[skin] ?: return listOf()
        val intersections: MutableList<MutableList<Double>> = mutableListOf()
        for (point in points.dropLast(1).withIndex()) {
            val isHorizontal = RectangularConnections.isSegmentHorizontal(skin.item, point.index)
            var segmentIntersections = findSegmentIntersections(skin, allPoints, behind, point.index, isHorizontal)
            val isDecreasing = if (isHorizontal) points[point.index + 1].x < point.value.x else points[point.index + 1].y < point.value.y
            if (segmentIntersections.isNotEmpty()) {
                segmentIntersections = segmentIntersections.sorted()
                if (isDecreasing) segmentIntersections.reversed()
                intersections.add(segmentIntersections.toMutableList())
            }
            else {
                intersections.add(mutableListOf())
            }
        }
        return intersections
    }

    fun findSegmentIntersections(connection: GConnectionSkin, allPoints: Map<GConnectionSkin, List<Point2D>>,
                                 behind: Boolean, index: Int, isHorizontal: Boolean): List<Double> {
        val segmentIntersections: MutableList<Double> = mutableListOf()
        val points: List<Point2D> = allPoints[connection] ?: return listOf()
        for (entry in allPoints.entries) {
            if (!filterConnection(connection, behind, entry.key)) continue
            val otherPoints: List<Point2D> = entry.value
            if (otherPoints.isEmpty()) return listOf()
            for (point in otherPoints.dropLast(1).withIndex()) {
                if (connection == entry.key && (index > point.index) xor behind) continue
                if (isHorizontal) {
                    val a = points[index]
                    val b = points[index + 1]
                    val c = point.value
                    val d = otherPoints[point.index + 1]
                    if (GeometryUtils.checkIntersection(a, b, c, d)) {
                        segmentIntersections.add(c.x)
                    }
                } else {
                    val a = point.value
                    val b = otherPoints[point.index + 1]
                    val c = points[index]
                    val d = points[index + 1]
                    if (GeometryUtils.checkIntersection(a, b, c, d)) {
                        segmentIntersections.add(a.y)
                    }
                }
            }
        }
        return segmentIntersections
    }

    private fun filterConnection(connection: GConnectionSkin, behind: Boolean, otherConnection: GConnectionSkin): Boolean {
        if (connection == otherConnection) return true
        else if (behind) return checkIfBehind(connection, otherConnection)
        else return !checkIfBehind(connection, otherConnection)
    }

    private fun checkIfBehind(skin: GConnectionSkin, otherSkin: GConnectionSkin): Boolean {
        if (skin.connectionIndex == -1) return false
        return otherSkin.connectionIndex < skin.getParentIndex()
    }

}