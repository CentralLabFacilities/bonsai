package de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections

import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connectors.DefaultConnectorTypes
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.geometry.Side

/**
 * Miscellaneous helper methods for rectangular-shaped connections.
 */
object RectangularConnections {

    /**
     * Returns true if the segment beginning at index i is horizontal.
     *
     * <p>
     * This calculates using the index of the segment and the connector type it
     * starts from, and <b>not</b> the current position of the segment. The
     * latter may be unreliable in the case that 2 joints are on top of each
     * other.
     * </p>
     *
     * @param connection
     *            a {@link GConnection} instance with a non-null source
     *            connector
     * @param i
     *            an index in the list of the connection's points
     * @return {@code true} if the segment beginning at this index is horizontal
     */
    fun isSegmentHorizontal(connection: GConnection?, i: Int): Boolean {
        val sourceType: String? = connection?.source?.type
        val sourceIsLeft: Boolean = DefaultConnectorTypes.isLeft(sourceType)
        val sourceIsRight: Boolean = DefaultConnectorTypes.isRight(sourceType)
        val firstSegmentIsHorizontal: Boolean = sourceIsLeft || sourceIsRight
        return firstSegmentIsHorizontal == ((i and 1) == 0)
    }

    /**
     * Checks that the given connection has a workable number of joints.
     *
     * @param connection
     *            a {@link GConnection} that should be rectangular
     * @return {@code true} if the joint count is correct
     */
    fun checkJointCount(connection: GConnection): Boolean {
        val sourceSide: Side? = DefaultConnectorTypes.getSide(connection.source.type)
        val targetSide: Side? = DefaultConnectorTypes.getSide(connection.target.type)

        val bothHorizontal: Boolean = sourceSide?.isHorizontal ?: false && targetSide?.isHorizontal ?: false
        val bothVertical: Boolean = sourceSide?.isVertical ?: false && targetSide?.isVertical ?: false

        return if (bothVertical || bothHorizontal) {
            (connection.joints.size and 1) == 0
        } else {
            (connection.joints.size and 1) == 1
        }
    }

}