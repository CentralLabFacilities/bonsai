package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.addNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.clearConnectors
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connectors.DefaultConnectorTypes
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connectors.DefaultConnectorTypes.getSide
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorContainer
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.selections.SelectionCopier
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.State
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.AddCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CommandStack
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.RemoveCommand
import javafx.geometry.Side
import java.util.function.Predicate

/**
 * Responsible for default-skin specific logic in the graph editor demo.
 */
open class DefaultSkinController
/**
 * Creates a new [DefaultSkinController] instance.
 *
 * @param graphEditor the graph editor on display in this demo
 * @param graphEditorContainer the graph editor container on display in this demo
 */(protected val graphEditor: GraphEditor, protected val graphEditorContainer: GraphEditorContainer) : SkinController {
    override fun activate() {
        graphEditorContainer.minimap.connectionFilter = Predicate{c -> true}
    }

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

        val node = GNode()
        node.y = NODE_INITIAL_Y + windowYOffset
        val rightOutput = GConnector()
        node.connectors.add(rightOutput)
        val leftInput = GConnector()
        node.connectors.add(leftInput)
        node.x = NODE_INITIAL_X + windowXOffset
        rightOutput.type = DefaultConnectorTypes.RIGHT_OUTPUT
        leftInput.type = DefaultConnectorTypes.LEFT_INPUT
        addNode(graphEditor.model, node)
        println("Added default node")
    }

    /**
     * Adds a connector of the given type to all nodes that are currently selected.
     *
     * @param position the position of the new connector
     * @param input `true` for input, `false` for output
     */
    override fun addConnector(position: Side?, input: Boolean) {
        position?.let { pos ->
            val type = getType(pos, input)
            val model = graphEditor.model
            val skinLookup = graphEditor.skinLookup
            val command = CompoundCommand()
            for (node in model.nodes) {
                if (skinLookup.lookupNode(node)?.selected == true) {
                    if (countConnectors(node, pos) < MAX_CONNECTOR_COUNT) {
                        val connector = GConnector()
                        connector.type = type!!
                        command.append(AddCommand.create(node, { owner -> node.connectors }, connector));
                    }
                }
            }
            if (command.canExecute()) {
                CommandStack.getCommandStack(model).execute(command)
            }
        }
    }

    override fun clearConnectors() {
        clearConnectors(graphEditor.model, graphEditor.selectionManager.selectedNodes)
    }

    override fun handlePaste(selectionCopier: SelectionCopier?) {
        selectionCopier?.paste(null)
    }

    override fun handleSelectAll() {
        graphEditor.selectionManager.selectAll()
    }

    /**
     * Counts the number of connectors the given node currently has of the given type.
     *
     * @param node a [GNode] instance
     * @param side the [Side] the connector is on
     * @return the number of connectors this node has on the given side
     */
    private fun countConnectors(node: GNode, side: Side): Int {
        var count = 0
        for (connector in node.connectors) {
            if (side == getSide(connector.type)) {
                count++
            }
        }
        return count
    }

    /**
     * Gets the connector type string corresponding to the given position and input values.
     *
     * @param position a [Side] value
     * @param input `true` for input, `false` for output
     * @return the connector type corresponding to these values
     */
    private fun getType(position: Side, input: Boolean): String? {
        return when (position) {
            Side.TOP -> {
                if (input) {
                    DefaultConnectorTypes.TOP_INPUT
                } else DefaultConnectorTypes.TOP_OUTPUT
            }

            Side.RIGHT -> {
                if (input) {
                    DefaultConnectorTypes.RIGHT_INPUT
                } else DefaultConnectorTypes.RIGHT_OUTPUT
            }

            Side.BOTTOM -> {
                if (input) {
                    DefaultConnectorTypes.BOTTOM_INPUT
                } else DefaultConnectorTypes.BOTTOM_OUTPUT
            }

            Side.LEFT -> {
                if (input) {
                    DefaultConnectorTypes.LEFT_INPUT
                } else DefaultConnectorTypes.LEFT_OUTPUT
            }
        }
    }

    companion object {
        protected const val NODE_INITIAL_X = 19.0

        protected const val NODE_INITIAL_Y = 19.0
        private const val MAX_CONNECTOR_COUNT = 5
    }
}