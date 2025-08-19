package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.addNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.DefaultConnectionSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.DefaultConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.DefaultNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.DefaultTailSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorContainer
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.selections.SelectionCopier
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.State
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import javafx.geometry.Side
import javafx.util.Callback
import java.util.function.Predicate
import kotlin.math.floor

/**
 * Responsible for tree-skin specific logic in the graph editor demo.
 */
class TreeSkinController
/**
 * Creates a new [TreeSkinController] instance.
 *
 * @param graphEditor the graph editor on display in this demo
 * @param graphEditorContainer the graph editor container on display in this demo
 */(private val graphEditor: GraphEditor, private val graphEditorContainer: GraphEditorContainer) : SkinController {
    override fun activate() {
        graphEditor.nodeSkinFactory = Callback { node: GNode -> this.createSkin(node) }
        graphEditor.connectorSkinFactory = Callback { connector: GConnector -> this.createSkin(connector) }
        graphEditor.connectionSkinFactory = Callback { connection: GConnection -> this.createSkin(connection) }
        graphEditor.tailSkinFactory = Callback { connector: GConnector -> createTailSkin(connector) }
        //graphEditorContainer.minimap.setConnectionFilter { c: GConnection? -> false }
        graphEditorContainer.minimap.connectionFilter = Predicate { false }
    }

    private fun createSkin(node: GNode): GNodeSkin {
        return if (TreeSkinConstants.TREE_NODE == node.type) TreeNodeSkin(node) else DefaultNodeSkin(node)
    }

    private fun createSkin(connection: GConnection): GConnectionSkin {
        return if (TreeSkinConstants.TREE_CONNECTION == connection.type) TreeConnectionSkin(connection) else DefaultConnectionSkin(connection)
    }

    private fun createSkin(connector: GConnector): GConnectorSkin {
        return if (TreeSkinConstants.TREE_INPUT_CONNECTOR == connector.type || TreeSkinConstants.TREE_OUTPUT_CONNECTOR == connector.type) TreeConnectorSkin(connector) else DefaultConnectorSkin(connector)
    }

    private fun createTailSkin(connector: GConnector): GTailSkin {
        return if (TreeSkinConstants.TREE_INPUT_CONNECTOR == connector.type || TreeSkinConstants.TREE_OUTPUT_CONNECTOR == connector.type) TreeTailSkin(connector) else DefaultTailSkin(connector)
    }

    override fun addNode(currentZoomFactor: Double, state: State) {
        val windowXOffset = graphEditorContainer.contentX / currentZoomFactor
        val windowYOffset = graphEditorContainer.contentY / currentZoomFactor
        val node = GNode()
        node.y = TREE_NODE_INITIAL_Y + windowYOffset
        val output = GConnector()
        node.connectors.add(output)
        val initialX = graphEditorContainer.width / (2 * currentZoomFactor) - node.width / 2
        node.x = floor(initialX) + windowXOffset
        node.type = TreeSkinConstants.TREE_NODE
        output.type = TreeSkinConstants.TREE_OUTPUT_CONNECTOR

        // This allows multiple connections to be created from the output.
        output.connectionDetachedOnDrag = false
        addNode(graphEditor.model, node)
    }

    override fun addConnector(position: Side?, input: Boolean) {
        // Not implemented for tree nodes.
    }

    override fun clearConnectors() {
        // Not implemented for tree nodes.
    }

    override fun handlePaste(selectionCopier: SelectionCopier?) {
        selectionCopier!!.paste { nodes: List<GNode?>, command: CompoundCommand? -> selectReferencedConnections(nodes) }
    }

    override fun handleSelectAll() {
        graphEditor.selectionManager.selectAll()
    }

    /**
     * Selects all connections that are referenced (i.e. connected to) the given nodes.
     *
     * @param nodes a list of graph nodes
     */
    private fun selectReferencedConnections(nodes: List<GNode?>) {
        nodes.stream()
                .flatMap { node: GNode? -> node!!.connectors.stream() }
                .flatMap { connector: GConnector -> connector.connections.stream() }
                .forEach { obj: GConnection? -> graphEditor.selectionManager.select(obj!!) }
    }

    companion object {
        protected const val TREE_NODE_INITIAL_Y = 19
    }
}