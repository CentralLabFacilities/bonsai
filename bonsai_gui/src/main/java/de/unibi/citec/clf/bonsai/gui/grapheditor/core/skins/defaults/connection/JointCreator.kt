package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.EditorElement
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GJointSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.RectangularConnections
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import javafx.event.EventHandler
import javafx.geometry.Point2D
import javafx.scene.Group
import javafx.scene.input.MouseButton
import javafx.scene.input.MouseEvent
import javafx.scene.shape.Rectangle

class JointCreator(private val connection: GConnection, private val offsetCalculator: CursorOffsetCalculator) {

    companion object {

        private const val STYLE_CLASS_HOVER_EFFECT = "default-connection-hover-effect"
        private const val HOVER_EFFECT_SIZE = 12.0

    }

    var graphEditor: GraphEditor? = null

    private val hoverEffect = Rectangle(HOVER_EFFECT_SIZE, HOVER_EFFECT_SIZE)

    private var temporarySelectedJointSkin: GJointSkin? = null

    private var newJointX = 0.0
    private var newJointY = 0.0

    private val temporaryJoints: MutableList<GJoint> = mutableListOf()
    private var oldJointPositions: List<Point2D> = listOf()

    init {
        hoverEffect.styleClass.addAll(STYLE_CLASS_HOVER_EFFECT)
        hoverEffect.isPickOnBounds = true
        hoverEffect.isVisible = false
    }

    private fun checkEditable(): Boolean {
        return graphEditor?.editorProperties?.let {
            !it.isReadOnly(EditorElement.JOINT)
        } ?: false
    }

    fun addJointCreationHandler(root: Group) {
        root.children.add(hoverEffect)

        root.onMouseEntered = EventHandler { event -> updateHoverEffectPosition(event, root) }
        root.onMouseMoved = EventHandler { event -> updateHoverEffectPosition(event, root) }
        root.onMouseExited = EventHandler { event -> hoverEffect.isVisible = false }

        root.onMouseDragged = EventHandler { event ->
            if (!checkEditable() || event.button != MouseButton.PRIMARY || temporarySelectedJointSkin == null) return@EventHandler
            temporarySelectedJointSkin!!.root?.fireEvent(event)
            event.consume()
        }

        root.onMousePressed = EventHandler { event ->
            val sceneX = event.x
            val sceneY = event.y

            val offset = offsetCalculator.getOffset(sceneX, sceneY)

            if (!checkEditable() || event.button != MouseButton.PRIMARY || offset == null) return@EventHandler

            oldJointPositions = GeometryUtils.getJointPositions(connection)

            val index = getNewJointLocation(event, root)

            if (index > -1) {
                val oldJointCount = connection.joints.size
                addTemporaryJoints(index, newJointX, newJointY)
                graphEditor?.let { graphEditor ->
                    if (index == oldJointCount) {
                        val newSelectedJoint1 = connection.joints[index]
                        temporarySelectedJointSkin = graphEditor.skinLookup.lookupJoint(newSelectedJoint1)
                    } else {
                        val newSelectedJoint2 = connection.joints[index + 1]
                        temporarySelectedJointSkin = graphEditor.skinLookup.lookupJoint(newSelectedJoint2)
                    }
                    temporarySelectedJointSkin?.root?.fireEvent(event)
                    temporarySelectedJointSkin?.item?.let { graphEditor.selectionManager.select(it) }
                }
            }
            event.consume()
        }

        root.onMouseReleased = EventHandler { event ->
            if (!checkEditable() || event.button != MouseButton.PRIMARY || temporarySelectedJointSkin == null) return@EventHandler
            val newJointPositions: List<Point2D> = getNewJointPositions()
            removeTemporaryJoints()
            if (checkForNetChange(oldJointPositions, newJointPositions)) JointCommands.setNewJoints(graphEditor?.model, newJointPositions, connection)
        }
    }

    private fun updateHoverEffectPosition(event: MouseEvent, root: Group) {
        val sceneX = event.sceneX
        val sceneY = event.sceneY
        val offset = offsetCalculator.getOffset(sceneX, sceneY)

        if (offset == null) {
            hoverEffect.isVisible = false
            return
        }

        hoverEffect.isVisible = true

        val sceneCoordinatesOfParent = root.parent.localToScene(0.0, 0.0)
        val scaleFactor = root.localToSceneTransform.mxx

        val x = (sceneX - sceneCoordinatesOfParent.x + offset.x) / scaleFactor
        val y = (sceneY - sceneCoordinatesOfParent.y + offset.y) / scaleFactor

        hoverEffect.x = GeometryUtils.moveOnPixel(x - HOVER_EFFECT_SIZE / 2)
        hoverEffect.y = GeometryUtils.moveOnPixel(y - HOVER_EFFECT_SIZE / 2)
    }

    private fun getNewJointLocation(event: MouseEvent, root: Group): Int {
        val index = offsetCalculator.getNearestSegment(event.sceneX, event.sceneY)

        if (index == -1 || connection.joints.isEmpty()) return -1

        val adjacentJointX: Double
        val adjacentJointY: Double

        if (index < connection.joints.size) {
            adjacentJointX = connection.joints[index].x
            adjacentJointY = connection.joints[index].y
        } else {
            adjacentJointX = connection.joints[index - 1].x
            adjacentJointY = connection.joints[index - 1].y
        }

        val clickPositionInParent = root.localToParent(event.x, event.y)

        if (RectangularConnections.isSegmentHorizontal(connection, index)) {
            newJointX = GeometryUtils.moveOnPixel(clickPositionInParent.x)
            newJointY = GeometryUtils.moveOnPixel(adjacentJointY)
        } else {
            newJointX = GeometryUtils.moveOnPixel(adjacentJointX)
            newJointY = GeometryUtils.moveOnPixel(clickPositionInParent.y)
        }
        return index
    }

    private fun addTemporaryJoints(index: Int, x: Double, y: Double) {
        val firstNewJoint = GJoint()
        val secondNewJoint = GJoint()

        firstNewJoint.x = x
        firstNewJoint.y = y

        secondNewJoint.x = x
        secondNewJoint.y = y

        temporaryJoints.add(firstNewJoint)
        temporaryJoints.add(secondNewJoint)

        connection.joints.add(index, secondNewJoint)
        connection.joints.add(index, firstNewJoint)

        graphEditor?.flush()
    }

    private fun removeTemporaryJoints() {
        for (joint in temporaryJoints) {
            connection.joints.remove(joint)
        }
        temporaryJoints.clear()
    }

    private fun getNewJointPositions(): List<Point2D> {
        graphEditor?.skinLookup?.let {
            val allJointPositions = GeometryUtils.getJointPositions(connection, it)
            val jointsToCleanUp = JointCleaner.findJointsToCleanUp(allJointPositions)
            val newJointPositions: MutableList<Point2D> = mutableListOf()

            for (jointPosition in allJointPositions.withIndex()) {
                if (!jointsToCleanUp.get(jointPosition.index)) {
                    newJointPositions.add(jointPosition.value)
                }
            }

            return newJointPositions
        }
        return listOf()
    }

    private fun checkForNetChange(oldPositions: List<Point2D>, newPositions: List<Point2D>): Boolean {
        return !(oldPositions.containsAll(newPositions) && newPositions.containsAll(oldPositions))
    }



}