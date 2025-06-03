package de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GJointSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.geometry.Point2D
import javafx.scene.Node
import javafx.scene.input.MouseEvent
import kotlin.math.ceil
import kotlin.math.round

/**
 * Utility class containing helper methods relating to geometry, positions, etc.
 */
object GeometryUtils {

    const val HALF_A_PIXEL = 0.5

    /**
     * Gets the position of the <b>center</b> of a connector in the coordinate system of the view.
     *
     * <p>
     * Only works for connectors that are attached to nodes.
     * <p>
     *
     * @param connector the {@link GConnector} whose position is desired
     * @param skinLookup the {@link SkinLookup} instance for this graph editor
     *
     * @return the x and y coordinates of the connector, or {@code null} if the connector isn't attached to a node
     */
    fun getConnectorPosition(connector: GConnector, skinLookup: SkinLookup): Point2D? {
        val connectorSkin: GConnectorSkin? = skinLookup.lookupConnector(connector)
        val parent: GNode? = connector.parent
        val nodeSkin: GNodeSkin = parent?.let { skinLookup.lookupNode(it) } ?: return null

        nodeSkin.layoutConnectors()

        val nodeX: Double = nodeSkin.root?.layoutX ?: 0.0
        val nodeY: Double = nodeSkin.root?.layoutY ?: 0.0

        val connectorPosition: Point2D? = connectorSkin?.let { nodeSkin.getConnectorPosition(it) }

        val connectorX: Double = connectorPosition?.x ?: return null
        val connectorY: Double = connectorPosition.y

        return Point2D(moveOnPixel(nodeX + connectorX), moveOnPixel(nodeY + connectorY))
    }

    /**
     * Gets the position of the cursor relative to some node.
     *
     * @param event a {@link MouseEvent} storing the cursor position
     * @param node some {@link Node}
     *
     * @return the position of the cursor relative to the node origin
     */
    fun getCursorPosition(event: MouseEvent, node: Node?): Point2D {
        val sceneX = event.sceneX
        val sceneY = event.sceneY
        val containerScene: Point2D = node?.localToScene(0.0, 0.0) ?: Point2D.ZERO
        return Point2D(sceneX - containerScene.x, sceneY - containerScene.y)
    }

    /**
     * Gets the layout x and y values from all joints in a list of joint skins.
     *
     * @param jointSkins a list of joint skin instances
     *
     * @return a {@link List} of {@link Point2D} objects containing joint x and y values
     */
    fun getJointPositions(jointSkins: List<GJointSkin>): List<Point2D> {
        val jointPositions: MutableList<Point2D> = mutableListOf()
        for (jointSkin in jointSkins) {
            val region = jointSkin.root
            val x = (region?.layoutX ?: 0.0) + jointSkin.width / 2
            val y = (region?.layoutY ?: 0.0) + jointSkin.height / 2
            jointPositions.add(Point2D(x, y))
        }
        return jointPositions
    }

    /**
     * Gets the layout x and y values from all joints within a connection.
     *
     * <p>
     * Uses the JavaFX properties of the skins, not the model values. Is
     * therefore always up-to-date, even during a drag gesture where the model
     * is not necessarily updated.
     * <p>
     *
     * @param connection
     *            the {@link GConnection} for which the positions are desired
     * @param skinLookup
     *            the {@link SkinLookup} instance for this graph editor
     *
     * @return a {@link List} of {@link Point2D} objects containing joint x and
     *         y values
     */
    fun getJointPositions(connection: GConnection, skinLookup: SkinLookup): List<Point2D> {
        val jointPositions: MutableList<Point2D> = mutableListOf()
        for (joint in connection.joints) {
            getJointPosition(joint, skinLookup)?.let { jointPositions.add(it) }
        }
        return jointPositions
    }

    /**
     * Gets the x and y values from all joints within a connection.
     *
     * @param connection a {@link GConnection} instance
     *
     * @return a {@link List} of {@link Point2D} objects containing joint x and y values
     */
    fun getJointPositions(connection: GConnection): List<Point2D> {
        val jointPositions: MutableList<Point2D> = mutableListOf()
        for (joint in connection.joints) {
            jointPositions.add(Point2D(joint.x, joint.y))
        }
        return jointPositions
    }

    /**
     * Gets the layout x and y values from all joints within a connection.
     *
     * <p>
     * Uses the JavaFX properties of the skins, not the model values. Is
     * therefore always up-to-date, even during a drag gesture where the model
     * is not necessarily updated.
     * <p>
     *
     * @param joint
     *            the {@link GJoint} for which the position is desired
     * @param skinLookup
     *            the {@link SkinLookup} instance for this graph editor
     * @return {@link Point2D} object containing joint x and y values
     */
    fun getJointPosition(joint: GJoint, skinLookup: SkinLookup): Point2D? {
        return skinLookup.lookupJoint(joint)?.let {
            val x = (it.root?.layoutX ?: 0.0) + it.width / 2
            val y = (it.root?.layoutY ?: 0.0) + it.height / 2
            Point2D(x, y)
        }
    }

    /**
     * Gets the layout x and y values from all joints within a connection.
     *
     * <p>
     * Uses the JavaFX properties of the skins, not the model values. Is
     * therefore always up-to-date, even during a drag gesture where the model
     * is not necessarily updated.
     * <p>
     *
     * @param connection
     *            the {@link GConnection} for which the positions are desired
     * @param skinLookup
     *            the {@link SkinLookup} instance for this graph editor
     * @param pTarget
     *            the array where to write the points to
     */
    fun fillJointPositions(connection: GConnection, skinLookup: SkinLookup, pTarget: Array<Point2D?>) {
        for (i in connection.joints.indices) {
            val joint = connection.joints[i]
            pTarget[i + 1] = getJointPosition(joint, skinLookup)
        }
    }

    /**
     * Moves an x or y position value off-pixel.
     *
     * <p>
     * This is for example useful for a 1-pixel-wide stroke with a stroke-type of centered. The x and y positions need
     * to be off-pixel so that the stroke is on-pixel.
     * </p>
     *
     * @param position the position to move off-pixel
     *
     * @return the position moved to the nearest value halfway between two integers
     */
    fun moveOffPixel(position: Double): Double {
        return ceil(position) - HALF_A_PIXEL
    }

    /**
     * Moves an x or y position value on-pixel.
     *
     * <p>
     * Lines drawn off-pixel look blurry. They should therefore have integer x and y values.
     * </p>
     *
     * @param position the position to move on-pixel
     *
     * @return the position rounded to the nearest integer
     */
    fun moveOnPixel(position: Double): Double {
        return ceil(position)
    }

    /**
     * Checks if a horizontal line segment AB intersects with a vertical line segment CD.
     *
     * @param pointA start of line segment AB
     * @param pointB end of line segment AB
     * @param pointC start of line segment CD
     * @param pointD end of line segment CD
     * @return {@code true} if AB and CD intersect, {@code false} otherwise
     */
    fun checkIntersection(pointA: Point2D, pointB: Point2D, pointC: Point2D, pointD: Point2D): Boolean {
        if (!(pointC.x > pointA.x && pointC.x < pointB.x) && !(pointC.x > pointB.x && pointC.x < pointA.x)) return false
        if (!(pointA.y > pointC.y && pointA.y < pointD.y) && !(pointA.y > pointD.y && pointA.y < pointC.y)) return false
        else return true
    }

    /**
     * Checks if the given position is between two values.
     *
     * <p>
     * Also returns true if the given position is equal to either of the values.
     * </p>
     *
     * @param firstValue an x or y position value
     * @param secondValue another x or y position value
     * @param position the cursor's position value
     *
     * @return {@code true} if the cursor position is between the two points
     */
    fun checkInRange(firstValue: Double, secondValue: Double, position: Double): Boolean {
        return if (secondValue >= firstValue) position in firstValue..secondValue
        else position in secondValue..firstValue
    }

    /**
     * Rounds some value to the nearest multiple of the grid spacing.
     *
     * @param properties
     *            {@link GraphEditorProperties} or {@code null}
     * @param value
     *            a double value
     * @return the input value rounded to the nearest multiple of the grid
     *         spacing
     */
    fun roundToGridSpacing(properties: GraphEditorProperties?, value: Double): Double {
        if (properties == null || !properties.snapToGrid) {
            return value
        }
        return properties.gridSpacing * round(value / properties.gridSpacing)
    }
}


