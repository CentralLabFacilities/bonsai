package de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GTailSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorView
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.geometry.Point2D
import javafx.scene.input.MouseEvent

/**
 * Responsible for creating, drawing, and removing tails.
 */
class TailManager(val skinLookup: SkinLookup, val view: GraphEditorView) {

    private var tailSkin: GTailSkin? = null
    private var sourcePosition: Point2D? = null
    private var jointPositions: List<Point2D>? = null

    /**
     * Creates a new tail and adds it to the view.
     *
     * @param connector the connector where the tail starts from
     * @param event the mouse event responsible for creating the tail
     */
    fun create(connector: GConnector, event: MouseEvent) {
        if (tailSkin == null) {
            tailSkin = skinLookup.lookupTail(connector)
            sourcePosition = GeometryUtils.getConnectorPosition(connector, skinLookup)
            val cursorPosition: Point2D = getScaledPosition(GeometryUtils.getCursorPosition(event, view))
            tailSkin?.draw(sourcePosition, cursorPosition)
            tailSkin?.let { view.add(it) }
        }
    }

    /**
     * Updates the tail to follow a connection that was detached.
     *
     * @param pJointPositions
     * @param newSource
     * @param event
     *            the mouse event responsible for creating the tail
     */
    fun updateToNewSource(pJointPositions: List<Point2D>, newSource: GConnector, event: MouseEvent) {
        cleanUp()
        jointPositions = pJointPositions
        tailSkin = skinLookup.lookupTail(newSource)
        sourcePosition = GeometryUtils.getConnectorPosition(newSource, skinLookup)
        val cursorPosition: Point2D = getScaledPosition(GeometryUtils.getCursorPosition(event, view))
        tailSkin?.draw(sourcePosition, cursorPosition, jointPositions)
        tailSkin?.let { view.add(it) }
    }

    /**
     * Updates the tail position based on new cursor position.
     *
     * @param event the mouse event responsible for updating the position
     */
    fun updatePosition(event: MouseEvent) {
        if (tailSkin != null && sourcePosition != null) {
            val cursorPosition: Point2D = getScaledPosition(GeometryUtils.getCursorPosition(event, view))
            if (jointPositions != null) {
                tailSkin?.draw(sourcePosition, cursorPosition, jointPositions)
            } else {
                tailSkin?.draw(sourcePosition, cursorPosition)
            }
        }
    }

    /**
     * Snaps the position of the tail to show the position the connection itself would take if it would be created.
     *
     * @param source the source connector
     * @param target the target connector
     * @param valid {@code true} if the connection is valid, {@code false} if invalid
     */
    fun snapPosition(source: GConnector, target: GConnector, valid: Boolean) {
        tailSkin.let {
            val sourcePosition: Point2D? = GeometryUtils.getConnectorPosition(source, skinLookup)
            val targetPosition: Point2D? = GeometryUtils.getConnectorPosition(target, skinLookup)
            if (jointPositions != null) {
                tailSkin?.draw(sourcePosition, targetPosition, jointPositions!!, target, valid)
            } else {
                tailSkin?.draw(sourcePosition, targetPosition, target, valid)
            }
        }
    }

    /**
     * Cleans up.
     *
     * <p>
     * Called at the end of a drag gesture or during initialization. Removes any tail from the view and resets tracking
     * parameters.
     * </p>
     */
    fun cleanUp() {
        jointPositions = null
        tailSkin?.let {
            view.remove(it)
        }
        tailSkin = null
    }

    /**
     * Corrects the cursor position in the case where scale transforms are applied.
     *
     * @param cursorPosition the cursor position calculated assuming scale factor of 1
     *
     * @return the corrected cursor position
     */
    private fun getScaledPosition(cursorPosition: Point2D): Point2D {
        val scale: Double = view.localToSceneTransform.mxx
        return Point2D(cursorPosition.x / scale, cursorPosition.y / scale)
    }


}