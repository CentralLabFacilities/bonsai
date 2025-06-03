package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.RectangularConnections
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.segment.ConnectionSegment
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import javafx.geometry.Point2D
import javafx.scene.shape.ArcTo
import javafx.scene.shape.HLineTo
import javafx.scene.shape.MoveTo
import javafx.scene.shape.Path
import javafx.scene.shape.PathElement
import javafx.scene.shape.VLineTo
import kotlin.math.abs
import kotlin.math.ceil

class CursorOffsetCalculator(private val connection: GConnection, private val path: Path,
                             private val backgroundPath: Path,
                             private val connectionSegments: List<ConnectionSegment>) {

    private var minOffsetX = 0.0
    private var minOffsetY = 0.0
    private var currentX = 0.0
    private var currentY = 0.0


    fun getOffset(cursorSceneX: Double, cursorSceneY: Double): Point2D? {
        if (path.elements.isEmpty()) return null

        val scaleFactor = backgroundPath.localToSceneTransform.mxx
        val offsetBound = ceil(backgroundPath.strokeWidth / 2) * scaleFactor

        val test = MoveTo()

        test.x

        minOffsetX = offsetBound + 1
        minOffsetY = offsetBound + 1

        currentX = (path.elements.first() as MoveTo).x
        currentY = (path.elements.first() as MoveTo).y

        for (pathElement in path.elements.withIndex().drop(1)) {
            calculateOffset(pathElement.value, cursorSceneX, cursorSceneY, offsetBound)
        }

        return if (minOffsetX > offsetBound && minOffsetY > offsetBound) {
            null
        } else if (abs(minOffsetX) <= abs(minOffsetY)) {
            Point2D(minOffsetX, 0.0)
        } else {
            Point2D(0.0, minOffsetY)
        }
    }

    fun getNearestSegment(cursorX: Double, cursorY: Double): Int {
        var nearestIndex = -1
        var nearestDistance = -1.0
        for (segment in connectionSegments.withIndex()) {
            val start = path.localToScene(segment.value.start)
            val end = path.localToScene(segment.value.end)
            if (RectangularConnections.isSegmentHorizontal(connection, segment.index)) {
                val inRangeX = GeometryUtils.checkInRange(start.x, end.x, cursorX)
                val distanceY = abs(start.y - cursorY)
                if (inRangeX && (nearestDistance < 0 || distanceY < nearestDistance)) {
                    nearestIndex = segment.index
                    nearestDistance = distanceY
                }
            } else {
                val inRangeY = GeometryUtils.checkInRange(start.y, end.y, cursorY)
                val distanceX = abs(start.x - cursorX)
                if (inRangeY && (nearestDistance < 0 || distanceX < nearestDistance)) {
                    nearestIndex = segment.index
                    nearestDistance = distanceX
                }
            }
        }
        return nearestIndex
    }

    private fun calculateOffset(pathElement: PathElement, cursorSceneX: Double, cursorSceneY: Double, offsetBound: Double) {
        val currentSceneX = path.localToScene(currentX, currentY).x
        val currentSceneY = path.localToScene(currentX, cursorSceneY).y

        when(pathElement) {
            is HLineTo -> {
                val nextSceneX = path.localToScene(pathElement.x, currentY).x
                val possibleMinOffsetY = currentSceneY - cursorSceneY

                val cursorInRangeX = GeometryUtils.checkInRange(currentSceneX, nextSceneX, cursorSceneX)
                val cursorInRangeY = abs(possibleMinOffsetY) < offsetBound
                val foundCloser = abs(possibleMinOffsetY) < abs(minOffsetY)

                if (cursorInRangeX && cursorInRangeY && foundCloser) minOffsetY = possibleMinOffsetY

                currentX = pathElement.x
            }
            is ArcTo -> {
                currentX = pathElement.x
                currentY = pathElement.y
            }
            is VLineTo -> {
                val nextSceneY = path.localToScene(currentX, pathElement.y).y
                val possibleMinOffsetX = currentSceneX - cursorSceneX

                val cursorInRangeY = GeometryUtils.checkInRange(currentSceneY, nextSceneY, cursorSceneY)
                val cursorInRangeX = abs(possibleMinOffsetX) < offsetBound
                val foundCloser = abs(possibleMinOffsetX) < abs(minOffsetX)

                if (cursorInRangeY && cursorInRangeX && foundCloser) minOffsetX = possibleMinOffsetX

                currentY = pathElement.y
            }
        }
    }



}