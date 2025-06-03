package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectionSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GJointSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.RectangularConnections
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.segment.ConnectionSegment
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.segment.DetouredConnectionSegment
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.segment.GappedConnectionSegment
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import javafx.geometry.Point2D
import javafx.scene.Group
import javafx.scene.shape.MoveTo
import javafx.scene.shape.Path

open class SimpleConnectionSkin(connection: GConnection): GConnectionSkin(connection) {

    companion object {

        const val SHOW_DETOURS_KEY = "default-connection-skin-show-detours"
        private const val STYLE_CLASS = "default-connection"
        private const val STYLE_CLASS_BACKGROUND = "default-connection-background"

    }

    final override val root: Group = Group()

    val path: Path = Path()
    val backgroundPath: Path = Path()

    val connectionSegments: MutableList<ConnectionSegment> = mutableListOf()

    private var jointSkins: MutableList<GJointSkin> = mutableListOf()

    init {
        root.isManaged = false
        root.children.add(backgroundPath)
        root.children.add(path)

        path.isMouseTransparent = true

        backgroundPath.styleClass.setAll(STYLE_CLASS_BACKGROUND)
        path.styleClass.setAll(STYLE_CLASS)
    }

    override fun setJointSkins(jointSkins: List<GJointSkin>) {
        if (jointSkins.isNotEmpty()) {
            removeOldRectangularConstraints()
        }
        this.jointSkins = jointSkins.toMutableList()
        addRectangularConstraints()
    }

    override fun update(): List<Point2D> {
        val points = super.update()
        checkFirstAndLastJoints(points?.toMutableList() ?: mutableListOf())
        return points ?: mutableListOf()
    }

    override fun draw(allPoints: Map<GConnectionSkin, List<Point2D>>) {
        super.draw(allPoints)
        val intersections: List<MutableList<Double>> = IntersectionFinder.find(this, allPoints, checkShowDetours())
        allPoints[this]?.let { points ->
            drawAllSegments(points, intersections)
        } ?: {
            connectionSegments.clear()
            path.elements.clear()
        }
    }

    private fun removeOldRectangularConstraints() {
        for (jointSkin in jointSkins.dropLast(1).withIndex()) {
            val thisJoint = jointSkin.value.root
            val nextJoint = jointSkins[jointSkin.index + 1].root
            if (RectangularConnections.isSegmentHorizontal(item, jointSkin.index)) {
                thisJoint?.dependencyX = null
                nextJoint?.dependencyX = null
            } else {
                thisJoint?.dependencyY = null
                nextJoint?.dependencyY = null
            }
        }
    }

    private fun addRectangularConstraints() {
        for (jointSkin in jointSkins.dropLast(1).withIndex()) {
            val thisJoint = jointSkin.value.root
            val nextJoint = jointSkins[jointSkin.index + 1].root
            if (RectangularConnections.isSegmentHorizontal(item, jointSkin.index)) {
                thisJoint?.dependencyX = nextJoint
                nextJoint?.dependencyX = thisJoint
            } else {
                thisJoint?.dependencyY = nextJoint
                nextJoint?.dependencyY =thisJoint
            }
        }
    }

    private fun checkFirstAndLastJoints(points: MutableList<Point2D>) {
        alignJoint(points, RectangularConnections.isSegmentHorizontal(item, 0), true)
        alignJoint(points, RectangularConnections.isSegmentHorizontal(item, points.size - 2), false)
    }

    private fun alignJoint(points: MutableList<Point2D>, vertical: Boolean, start: Boolean) {
        val targetPositionIndex = if (start) 0 else points.size - 1
        val jointPositionIndex = if (start) 1 else points.size - 2
        val jointSkin = jointSkins[if (start) 0 else jointSkins.size - 1]

        if (vertical) {
            val newJointY = points[targetPositionIndex].y
            val newJointLayoutY = GeometryUtils.moveOnPixel(newJointY - jointSkin.height / 2)
            jointSkin.root?.layoutY = newJointLayoutY

            val currentX = points[jointPositionIndex].x
            points[jointPositionIndex] = Point2D(currentX, newJointY)
        } else {
            val newJointX = points[targetPositionIndex].x
            val newJointLayoutX = GeometryUtils.moveOnPixel(newJointX - jointSkin.width / 2)
            jointSkin.root?.layoutX = newJointLayoutX

            val currentY = points[jointPositionIndex].y
            points[jointPositionIndex] = Point2D(newJointX, currentY)
        }
    }

    private fun drawAllSegments(points: List<Point2D>, intersections: List<MutableList<Double>>) {
        val startX = points[0].x
        val startY = points[0].y

        val moveTo = MoveTo(GeometryUtils.moveOffPixel(startX), GeometryUtils.moveOffPixel(startY))

        connectionSegments.clear()
        path.elements.clear()
        path.elements.add(moveTo)

        for (point in points.dropLast(1).withIndex()) {
            val start = point.value
            val end = points[point.index + 1]

            val segmentIntersections = intersections[point.index]

            val segment: ConnectionSegment = if (checkShowDetours()) {
                DetouredConnectionSegment(start, end, segmentIntersections)
            } else {
                GappedConnectionSegment(start, end, segmentIntersections)
            }

            segment.draw()

            connectionSegments.add(segment)
            path.elements.addAll(segment.pathElements)
        }
        backgroundPath.elements.clear()
        backgroundPath.elements.addAll(path.elements)
    }

    private fun checkShowDetours(): Boolean {
        var showDetours = false
        graphEditor?.let {
            val value: String = it.editorProperties.customProperties[SHOW_DETOURS_KEY] ?: "false"
            if (value == true.toString()) showDetours = true
        }
        return showDetours
    }

    override fun selectionChanged(isSelected: Boolean) {
        // Not implemented
    }

}