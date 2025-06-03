package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import javafx.geometry.Point2D

/**
 * The skin class for a {@link GConnection}. Responsible for visualizing connections in the graph editor.
 *
 * <p>
 * A custom connection skin must extend this class. It <b>must</b> also provide a constructor taking exactly one
 * {@link GConnection} parameter.
 * </p>
 *
 * <p>
 * The root JavaFX node must be created by the skin implementation and returned in the {@link #getRoot()} method. For
 * example, a very simple connection skin could use a {@link Line} whose start and end positions are set to those of the
 * source and target connectors.
 * </p>
 */
abstract class GConnectionSkin(connection: GConnection): GSkin<GConnection>(connection) {

    var connectionIndex: Int = -1

    /**
     * Sets the skin objects for all joints inside the connection.
     *
     * <p>
     * This will be called as the connection skin is created. The connection skin can manipulate its joint skins if it
     * chooses. For example a 'rectangular' connection skin may restrict the movement of the first and last joints to
     * the x direction only.
     * </p>
     *
     * @param jointSkins the list of all {@link GJointSkin} instances associated to the connection
     */
    abstract fun setJointSkins(jointSkins: List<GJointSkin>)

    /**
     * Draws the connection skin. This is called every time the connection's
     * position could change, for example if one of its connectors is moved,
     * after {@link #update()}.
     *
     * <p>
     * A simple connection skin may ignore the given parameter. This parameter
     * can for example be used to display a 'rerouting' effect when the
     * connection passes over another connection.
     * </p>
     *
     * @param allConnections
     *            the lists of points for all connections (can be ignored in a
     *            simple skin)
     */
    open fun draw(allConnections: Map<GConnectionSkin, List<Point2D>>) {
        connectionIndex = if (root != null && root?.parent != null) {
            root!!.parent.childrenUnmodifiable.indexOf(root)
        } else {
            -1
        }
    }

    /**
     * Update and return the points of this connection. This is called every
     * time the connection's position could change, for example if one of its
     * connectors is moved before {@link #draw(Map)}.
     * <p>
     * The order of the points is as follows:
     *
     * <ol>
     * <li>Source position.
     * <li>Joint positions in same order the joints appear in their
     * {@link GConnection}.
     * <li>Target position.
     * </ol>
     *
     * </p>
     *
     * <p>
     * This method is called on <b>all</b> connection skins <b>before</b> the
     * draw method is called on any connection skin. It can safely be ignored by
     * simple skin implementations.
     * </p>
     *
     * <p>
     * Overriding this method allows the connection skin to apply constraints to
     * its set of points, and these constraints will be taken into account
     * during the draw methods of other connections, even if they are drawn
     * before this connection.
     * </p>
     *
     * @return points
     */
    open fun update(): List<Point2D>? {
        val tmpItem: GConnection = item ?: return null
        val skinLookup: SkinLookup = graphEditor?.skinLookup ?: return null
        if (tmpItem.joints.isEmpty()) {
            val points = arrayOfNulls<Point2D>(2)
            points[0] = item.source?.let { GeometryUtils.getConnectorPosition(it, skinLookup) }
            points[1] = item.target?.let { GeometryUtils.getConnectorPosition(it, skinLookup) }
            return points.toList().requireNoNulls()
        } else {
            val len = item.joints.size + 2
            val points = arrayOfNulls<Point2D>(len)
            GeometryUtils.fillJointPositions(item, skinLookup, points)
            points[0] = item.source?.let { GeometryUtils.getConnectorPosition(it, skinLookup) }
            points[len - 1] = item.target?.let { GeometryUtils.getConnectorPosition(it, skinLookup) }
            return points.toList().requireNoNulls()
        }
    }

    /**
     * @return cached position (index) of this connection skin inside the
     *         child-list of the parent connection layer.
     */
    fun getParentIndex(): Int {
        return connectionIndex
    }
}