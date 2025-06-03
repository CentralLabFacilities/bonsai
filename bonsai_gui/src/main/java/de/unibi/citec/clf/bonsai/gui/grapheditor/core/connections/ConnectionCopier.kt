package de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections

import de.unibi.citec.clf.bonsai.gui.grapheditor.core.utils.BeanUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode

/**
 * Helper methods to copy {@link GConnection connections}
 */
class ConnectionCopier {

    companion object {

        /**
         * Copies connection information from one set of nodes to another.
         *
         * <p>
         * Connections between nodes in the <b>keys</b> of the input map are copied
         * (including their joint information) and the new connections are set
         * inside the corresponding nodes in the <b>values</b> of the input map.
         * </p>
         *
         * <p>
         * The new connection information is set <em>directly</em>. EMF commands are
         * not used
         * </p>
         *
         * @param copies
         *            a map that links source nodes to their copies in its key-value
         *            pairs
         * @return the list of created connections
         */
        fun copyConnections(copies: MutableMap<GNode?, GNode?>): List<GConnection> {
            val copiedConnections: MutableMap<GConnection, GConnection> = HashMap()
            for (node in copies.keys) {
                node?.let { tmpNode ->
                    val copy: GNode = copies[tmpNode]!!
                    for (connector in tmpNode.connectors) {
                        val connectorIndex: Int = tmpNode.connectors.indexOf(connector)
                        val copiedConnector: GConnector = copy.connectors[connectorIndex]
                        copiedConnector.connections.clear()
                        for (connection in connector.connections) {
                            val opposingNode: GNode? = getOpposingNode(connector, connection)
                            val opposingNodePresent: Boolean = copies.contains(opposingNode)
                            if (opposingNodePresent) {
                                val copiedConnection: GConnection
                                if (!copiedConnections.contains(connection)) {
                                    copiedConnection = BeanUtils.copyBean(connection)!!
                                    copiedConnections.put(connection, copiedConnection)
                                } else {
                                    copiedConnection = copiedConnections[connection]!!
                                }
                                if (connection.source == connector) {
                                    copiedConnection.source = copiedConnector
                                } else {
                                    copiedConnection.target = copiedConnector
                                }
                            }
                        }
                    }
                }
            }
            return ArrayList(copiedConnections.values)
        }

        /**
         * Gets the node on the other side of the connection to the given connector.
         *
         * @param connector
         *            a {@link GConnector} instance
         * @param connection
         *            a {@link GConnection} attached to this connector
         * @return the {@link GNode} on the other side of the connection, or
         *         {@code null} if none exists
         */
        fun getOpposingNode(connector: GConnector, connection: GConnection): GNode? {
            val opposingConnector = if (connection.source == connector) {
                connection.target
            } else {
                connection.source
            }
            return if (opposingConnector?.parent is GNode) {
                opposingConnector.parent
            } else {
                null
            }
        }

    }
}