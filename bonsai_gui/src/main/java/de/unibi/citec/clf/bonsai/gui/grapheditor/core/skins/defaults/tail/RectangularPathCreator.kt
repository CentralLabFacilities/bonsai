package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.tail

import javafx.geometry.Point2D
import javafx.geometry.Side
import kotlin.math.max
import kotlin.math.min

object RectangularPathCreator {
    private const val MINIMUM_EXTENSION = 30.0

    fun createPath(startPosition: Point2D, endPosition: Point2D, startSide: Side, endSide: Side): List<Point2D> {
        return when {
            startSide == Side.LEFT && endSide == Side.LEFT -> connectLeftToLeft(startPosition, endPosition)
            startSide == Side.LEFT && endSide == Side.RIGHT -> connectLeftToRight(startPosition, endPosition)
            startSide == Side.LEFT && endSide == Side.TOP -> connectLeftToTop(startPosition, endPosition)
            startSide == Side.LEFT && endSide == Side.BOTTOM -> connectLeftToBottom(startPosition, endPosition)

            startSide == Side.RIGHT && endSide == Side.LEFT -> connectLeftToRight(startPosition, endPosition).reversed()
            startSide == Side.RIGHT && endSide == Side.RIGHT -> connectRightToRight(startPosition, endPosition)
            startSide == Side.RIGHT && endSide == Side.TOP -> connectRightToTop(startPosition, endPosition)
            startSide == Side.RIGHT && endSide == Side.BOTTOM -> connectRightToBottom(startPosition, endPosition)

            startSide == Side.TOP && endSide == Side.LEFT -> connectLeftToTop(startPosition, endPosition).reversed()
            startSide == Side.TOP && endSide == Side.RIGHT -> connectRightToTop(startPosition, endPosition).reversed()
            startSide == Side.TOP && endSide == Side.TOP -> connectTopToTop(startPosition, endPosition)
            startSide == Side.TOP && endSide == Side.BOTTOM -> connectTopToBottom(startPosition, endPosition)

            startSide == Side.BOTTOM && endSide == Side.LEFT -> connectLeftToBottom(startPosition, endPosition).reversed()
            startSide == Side.BOTTOM && endSide == Side.RIGHT -> connectRightToBottom(startPosition, endPosition).reversed()
            startSide == Side.BOTTOM && endSide == Side.TOP -> connectTopToBottom(startPosition, endPosition).reversed()
            else -> connectBottomToBottom(startPosition, endPosition)
        }
    }

    private fun connectLeftToLeft(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        val minX = min(start.x, end.x)
        addPoint(path, minX - MINIMUM_EXTENSION, start.y)
        addPoint(path, minX - MINIMUM_EXTENSION, end.y)
        return path
    }

    private fun connectLeftToRight(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        if (start.x >= end.x + 2 * MINIMUM_EXTENSION) {
            val averageX = (start.x + end.x) / 2
            addPoint(path, averageX, start.y)
            addPoint(path, averageX, end.y)
        } else {
            val averageY = (start.y + end.y) / 2
            addPoint(path, start.x - MINIMUM_EXTENSION, start.y)
            addPoint(path, start.x - MINIMUM_EXTENSION, averageY)
            addPoint(path, end.x + MINIMUM_EXTENSION, averageY)
            addPoint(path, end.x + MINIMUM_EXTENSION, end.y)
        }
        return path
    }

    private fun connectLeftToTop(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        if (start.x > end.x + MINIMUM_EXTENSION) {
            if (start.y < end.y - MINIMUM_EXTENSION) {
                addPoint(path, end.x, start.y)
            } else {
                val averageX = (start.x + end.x) / 2
                addPoint(path, averageX, start.y)
                addPoint(path, averageX, end.y - MINIMUM_EXTENSION)
                addPoint(path, end.x, end.y - MINIMUM_EXTENSION)
            }
        } else {
            if (start.y < end.y - MINIMUM_EXTENSION) {
                val averageY = (start.y + end.y) / 2
                addPoint(path, start.x - MINIMUM_EXTENSION, start.y)
                addPoint(path, start.x - MINIMUM_EXTENSION, averageY)
                addPoint(path, end.x, averageY)
            } else {
                addPoint(path, start.x - MINIMUM_EXTENSION, start.y)
                addPoint(path, start.x - MINIMUM_EXTENSION, end.y - MINIMUM_EXTENSION)
                addPoint(path, end.x, end.y - MINIMUM_EXTENSION)
            }
        }
        return path
    }

    private fun connectLeftToBottom(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        if (start.x > end.x + MINIMUM_EXTENSION) {
            if (start.y > end.y + MINIMUM_EXTENSION) {
                addPoint(path, end.x, start.y)
            } else {
                val averageX = (start.x + end.x) / 2
                addPoint(path, averageX, start.y)
                addPoint(path, averageX, end.y + MINIMUM_EXTENSION)
                addPoint(path, end.x, end.y + MINIMUM_EXTENSION)
            }
        } else {
            if (start.y > end.y + MINIMUM_EXTENSION) {
                val averageY = (start.y + end.y) / 2
                addPoint(path, start.x - MINIMUM_EXTENSION, start.y)
                addPoint(path, start.x - MINIMUM_EXTENSION, averageY)
                addPoint(path, end.x, averageY)
            } else {
                addPoint(path, start.x - MINIMUM_EXTENSION, start.y)
                addPoint(path, start.x - MINIMUM_EXTENSION, end.y + MINIMUM_EXTENSION)
                addPoint(path, end.x, end.y + MINIMUM_EXTENSION)
            }
        }
        return path
    }

    private fun connectRightToRight(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        val maxX = max(start.x, end.x)
        addPoint(path, maxX + MINIMUM_EXTENSION, start.y)
        addPoint(path, maxX + MINIMUM_EXTENSION, end.y)
        return path
    }

    private fun connectRightToTop(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        if (start.x < end.x - MINIMUM_EXTENSION) {
            if (start.y < end.y - MINIMUM_EXTENSION) {
                addPoint(path, end.x, start.y)
            } else {
                val averageX = (start.x + end.x) / 2
                addPoint(path, averageX, start.y)
                addPoint(path, averageX, end.y - MINIMUM_EXTENSION)
                addPoint(path, end.x, end.y - MINIMUM_EXTENSION)
            }
        } else {
            if (start.y < end.y - MINIMUM_EXTENSION) {
                val averageY = (start.y + end.y) / 2
                addPoint(path, start.x + MINIMUM_EXTENSION, start.y)
                addPoint(path, start.x + MINIMUM_EXTENSION, averageY)
                addPoint(path, end.x, averageY)
            } else {
                addPoint(path, start.x + MINIMUM_EXTENSION, start.y)
                addPoint(path, start.x + MINIMUM_EXTENSION, end.y - MINIMUM_EXTENSION)
                addPoint(path, end.x, end.y - MINIMUM_EXTENSION)
            }
        }
        return path
    }

    private fun connectRightToBottom(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        if (start.x < end.x - MINIMUM_EXTENSION) {
            if (start.y > end.y + MINIMUM_EXTENSION) {
                addPoint(path, end.x, start.y)
            } else {
                val averageX = (start.x + end.x) / 2
                addPoint(path, averageX, start.y)
                addPoint(path, averageX, end.y + MINIMUM_EXTENSION)
                addPoint(path, end.x, end.y + MINIMUM_EXTENSION)
            }
        } else {
            if (start.y > end.y + MINIMUM_EXTENSION) {
                val averageY = (start.y + end.y) / 2
                addPoint(path, start.x + MINIMUM_EXTENSION, start.y)
                addPoint(path, start.x+ MINIMUM_EXTENSION, averageY)
                addPoint(path, end.x, averageY)
            } else {
                addPoint(path, start.x + MINIMUM_EXTENSION, start.y)
                addPoint(path, start.x + MINIMUM_EXTENSION, end.y + MINIMUM_EXTENSION)
                addPoint(path, end.x, end.y + MINIMUM_EXTENSION)
            }
        }
        return path
    }

    private fun connectTopToTop(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        val minY = min(start.y, end.y)
        addPoint(path, start.x, minY - MINIMUM_EXTENSION)
        addPoint(path, end.x, minY - MINIMUM_EXTENSION)
        return path
    }

    private fun connectTopToBottom(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        if (start.y >= end.y + 2 * MINIMUM_EXTENSION) {
            val averageY = (start.y + end.y) / 2
            addPoint(path, start.x, averageY)
            addPoint(path, end.x, averageY)
        } else {
            val averageX = (start.x + end.x) / 2
            addPoint(path, start.x, start.y - MINIMUM_EXTENSION)
            addPoint(path, averageX, start.y - MINIMUM_EXTENSION)
            addPoint(path, averageX, end.y + MINIMUM_EXTENSION)
            addPoint(path, end.x, end.y + MINIMUM_EXTENSION)
        }
        return path
    }

    private fun connectBottomToBottom(start: Point2D, end: Point2D): List<Point2D> {
        val path: MutableList<Point2D> = mutableListOf()
        val maxY = max(start.y, end.y)
        addPoint(path, start.x, maxY + MINIMUM_EXTENSION)
        addPoint(path, end.x, maxY + MINIMUM_EXTENSION)
        return path
    }

    private fun addPoint(path: MutableList<Point2D>, x: Double, y: Double) {
        path.add(Point2D(x, y))
    }
}