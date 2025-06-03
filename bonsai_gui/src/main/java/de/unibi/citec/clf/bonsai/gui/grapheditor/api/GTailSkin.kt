package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.geometry.Point2D

/**
 * The tail-skin class for a {@link GConnector}. Responsible for visualizing the tails that extend temporarily from
 * connectors during a drag gesture in the graph editor.
 *
 * <p>
 * A custom tail skin must extend this class. It <b>must</b> also provide a constructor taking exactly one
 * {@link GConnector} parameter.
 * </p>
 *
 * <p>
 * Tail skins can have similar logic to connection skins, but they do not have to worry about positionable joints.
 * </p>
 */
abstract class GTailSkin(connector: GConnector): GSkin<GConnector>(connector) {

    /**
     * Updates the position of the tail according to the specified start and end points.
     *
     * <p>
     * This method will be called when a 'fresh' tail is created from an unoccupied connector.
     * </p>
     *
     * @param start a {@link Point2D} containing the start x and y values
     * @param end a {@link Point2D} containing the end x and y values
     */
    abstract fun draw(start: Point2D?, end: Point2D?)

    /**
     * Updates the position of the tail according to the specified start and end points.
     *
     * <p>
     * This method will be called when a tail is snapped to the target connector that the mouse is hovering over.
     * </p>
     *
     * @param start a {@link Point2D} containing the start x and y values
     * @param end a {@link Point2D} containing the end x and y values
     * @param target the target connector that the tail is snapping to
     * @param valid {@code true} if the connection is valid, {@code false} if invalid
     */
    abstract fun draw(start: Point2D?, end: Point2D?, target: GConnector, valid: Boolean)

    /**
     * Updates the position of the tail according to the specified start points, end points, and joint positions.
     *
     * <p>
     * This method will be called when an existing connection is repositioned. The tail skin may use the position of the
     * old connection to decide how to position itself, or it may ignore this information.
     * </p>
     *
     * @param start a {@link Point2D} containing the start x and y values
     * @param end a {@link Point2D} containing the end x and y values
     * @param jointPositions the positions of the joints at the time the connection was removed
     */
    abstract fun draw(start: Point2D?, end: Point2D?, jointPositions: List<Point2D>?)

    /**
     * Updates the position of the tail according to the specified start points, end points, and joint positions.
     *
     * <p>
     * This method will be called when an existing connection is repositioned and the stail is snapped to a target
     * connector.
     * </p>
     *
     * @param start a {@link Point2D} containing the start x and y values
     * @param end a {@link Point2D} containing the end x and y values
     * @param jointPositions
     * @param target the target connector that the tail is snapping to
     * @param valid {@code true} if the connection is valid, {@code false} if invalid
     */
    abstract fun draw(start: Point2D?, end: Point2D?, jointPositions: List<Point2D>?, target: GConnector, valid: Boolean)

    /**
     * Allocates a list of joint positions for a new connection.
     *
     * <p>
     * When the tail is 'converted' into a connection during a successful drag-drop gesture, this method will be called
     * so that the new connection's joint positions can be based on the final position of the tail.
     * </p>
     *
     * @return a list of {@code Point2D} objects containing x and y values for a newly-created connection
     */
    abstract fun allocateJointPositions(): List<Point2D>

}