package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorContainer
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.bonsai.BonsaiNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.titled.TitledSkinConstants
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.selections.SelectionCopier
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.State
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.Command
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.SetPropertyCommand
import javafx.util.Callback
import java.util.ArrayList

/**
 * Responsible for bonsai-skin specific logic in the graph editor.
 */
class BonsaiSkinController
/**
 * Creates a new [BonsaiSkinController] instance.
 *
 * @param graphEditor the graph editor on display
 * @param graphEditorContainer the graph editor container on display
 */
(graphEditor: GraphEditor, graphEditorContainer: GraphEditorContainer) : DefaultSkinController(graphEditor, graphEditorContainer) {
    /**
     * Should be called to activate the skin controller. It sets skin factories in graph editor to bonsai specific ones.
     */
    override fun activate() {
        super.activate()
        graphEditor.nodeSkinFactory = Callback { node: GNode -> this.createSkin(node) }
        graphEditor.connectorSkinFactory = Callback { connector: GConnector -> this.createSkin(connector) }
        graphEditor.connectionSkinFactory = Callback { connection: GConnection -> this.createSkin(connection) }
        graphEditor.tailSkinFactory = Callback { connector: GConnector -> createTailSkin(connector) }
        graphEditor.jointSkinFactory = Callback { joint: GJoint -> createSkin(joint) }
    }

    private fun createSkin(node: GNode): GNodeSkin {
        return BonsaiNodeSkin(node)
    }

    private fun createSkin(connector: GConnector): GConnectorSkin {
        return DefaultConnectorSkin(connector)
    }

    private fun createSkin(connection: GConnection): GConnectionSkin {
        return DefaultConnectionSkin(connection)
    }

    private fun createSkin(joint: GJoint): GJointSkin {
        return DefaultJointSkin(joint)
    }

    private fun createTailSkin(connector: GConnector): GTailSkin {
        return DefaultTailSkin(connector)
    }

    /**
     * Handles addition of new node to graph editor
     */
    override fun addNode(currentZoomFactor: Double, state: State) {
        val windowXOffset: Double
        val windowYOffset: Double
        if (currentZoomFactor != 0.0) {
            windowXOffset = graphEditorContainer.contentX / currentZoomFactor
            windowYOffset = graphEditorContainer.contentY / currentZoomFactor
        } else {
            windowYOffset = graphEditorContainer.contentY
            windowXOffset = graphEditorContainer.contentX
        }
        val node = GNode(state)
        node.y = NODE_INITIAL_Y + windowYOffset
        node.type = TitledSkinConstants.TITLED_NODE
        node.x = NODE_INITIAL_X + windowXOffset
        node.id = allocateNewId()
        /*
        val input = GConnector()
        node.connectors.add(input)
        input.type = TitledSkinConstants.TITLED_INPUT_CONNECTOR
        val output = GConnector()
        node.connectors.add(output)
        output.type = TitledSkinConstants.TITLED_OUTPUT_CONNECTOR
         */
        Commands.addNode(graphEditor.model, node)
    }

    /**
     * Handles paste action in graph editor, e.g. gets new id for pasted node(s).
     * @param selectionCopier the selectionCopier instance used in graph editor
     */
    override fun handlePaste(selectionCopier: SelectionCopier?) {
        selectionCopier?.paste { nodes: List<GNode?>, command: CompoundCommand -> allocateIds(nodes, command) }
    }

    /**
     * Handles select all action in graph editor.
     */
    override fun handleSelectAll() {
        graphEditor.selectionManager.selectAll()
    }

    /**
     * Allocates ID's to recently pasted nodes.
     *
     * @param nodes the recently pasted nodes
     * @param command the command responsible for adding the nodes
     */
    private fun allocateIds(nodes: List<GNode?>, command: CompoundCommand) {
        for (node in nodes) {
            if (checkNeedsNewId(node, nodes)) {
                val id = allocateNewId()
                val setCommand: Command = SetPropertyCommand.create(node!!.idProperty(), id)
                //final Command setCommand = SetCommand.create(domain, node, feature, id);
                if (setCommand.canExecute()) {
                    command.append(setCommand)
                    command.execute()
                }
                graphEditor.skinLookup.lookupNode(node)!!.initialize()
            }
        }
    }

    /**
     * Check the given node needs a new ID, i.e. that it's not already in use.
     *
     * @param node the nodes to check
     * @param pastedNodes the recently-pasted nodes
     */
    private fun checkNeedsNewId(node: GNode?, pastedNodes: List<GNode?>): Boolean {
        val nodes: MutableList<GNode?> = ArrayList(graphEditor.model.nodes)
        nodes.removeAll(pastedNodes)
        return nodes.stream().anyMatch { other: GNode? -> other!!.id == node!!.id }
    }

    /**
     * Allocates a new ID corresponding to the largest existing ID + 1.
     *
     * @return the new ID
     */
    private fun allocateNewId(): String {
        val nodes: List<GNode> = graphEditor.model.nodes
        val max = nodes.mapNotNull { it.id?.toIntOrNull() }.maxOrNull()
        return max?.let {
            (it + 1).toString()
        } ?: "1"
    }



    companion object {
        private const val NODE_INITIAL_X = 19.0
        private const val NODE_INITIAL_Y = 19.0
    }
}