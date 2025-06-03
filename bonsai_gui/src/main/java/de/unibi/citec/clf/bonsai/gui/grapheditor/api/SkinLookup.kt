package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode

/**
 * Provides lookup methods to connect each model instance to its skin instance.
 */
interface SkinLookup {

    /**
     * Gets the skin for the given node.
     *
     * @param node a {@link GNode} instance
     *
     * @return the associated {@link GNodeSkin} instance
     */
    fun lookupNode(node: GNode): GNodeSkin?

    /**
     * Gets the skin for the given connector.
     *
     * @param connector a {@link GConnector} instance
     *
     * @return the associated {@link GConnectorSkin} instance
     */
    fun lookupConnector(connector: GConnector): GConnectorSkin?

    /**
     * Gets the skin for the given connection.
     *
     * @param connection a {@link GConnection} instance
     *
     * @return the associated {@link GConnectionSkin} instance
     */
    fun lookupConnection(connection: GConnection): GConnectionSkin?

    /**
     * Gets the skin for the given joint.
     *
     * @param joint a {@link GJoint} instance
     *
     * @return the associated {@link GJointSkin} instance
     */
    fun lookupJoint(joint: GJoint): GJointSkin?

    /**
     * Gets the tail skin for the given connector.
     *
     * @param connector a {@link GConnector} instance
     *
     * @return the associated {@link GTailSkin} instance
     */
    fun lookupTail(connector: GConnector): GTailSkin?

}