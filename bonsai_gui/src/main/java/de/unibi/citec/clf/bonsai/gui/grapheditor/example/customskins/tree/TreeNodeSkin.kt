package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.utils.AwesomeIcon
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CommandStack
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.RemoveCommand
import javafx.css.PseudoClass
import javafx.event.ActionEvent
import javafx.event.EventHandler
import javafx.geometry.Point2D
import javafx.geometry.Pos
import javafx.scene.Cursor
import javafx.scene.control.Button
import javafx.scene.input.MouseEvent
import javafx.scene.layout.StackPane
import javafx.scene.shape.Rectangle

/**
 * Node skin for a 'tree-like' graph.
 */
class TreeNodeSkin(node: GNode?) : GNodeSkin(node!!) {
    private val selectionHalo = Rectangle()
    private val addChildButton = Button()
    private var inputConnectorSkin: GConnectorSkin? = null
    private var outputConnectorSkin: GConnectorSkin? = null

    // Border and background are separated into 2 rectangles so they can have different effects applied to them.
    private val border = Rectangle()
    private val background = Rectangle()

    /**
     * Creates a new [TreeNodeSkin] instance.
     *
     * @param node the {link GNode} this skin is representing
     */
    init {
        background.widthProperty().bind(border.widthProperty().subtract(border.strokeWidthProperty().multiply(2)))
        background.heightProperty().bind(border.heightProperty().subtract(border.strokeWidthProperty().multiply(2)))
        border.widthProperty().bind(root!!.widthProperty())
        border.heightProperty().bind(root!!.heightProperty())
        border.styleClass.setAll(STYLE_CLASS_BORDER)
        background.styleClass.setAll(STYLE_CLASS_BACKGROUND)
        root!!.children.addAll(border, background)
        root!!.setMinSize(MIN_WIDTH, MIN_HEIGHT)
        addSelectionHalo()
        addButton()
        background.addEventFilter(MouseEvent.MOUSE_DRAGGED) { event: MouseEvent -> filterMouseDragged(event) }
    }

    override fun setConnectorSkins(connectorSkins: List<GConnectorSkin>) {
        removeConnectors()
        if (connectorSkins == null || connectorSkins.isEmpty() || connectorSkins.size > 2) {
            return
        }
        for (skin in connectorSkins) {
            if (TreeSkinConstants.TREE_OUTPUT_CONNECTOR == skin.item!!.type) {
                outputConnectorSkin = skin
                root!!.children.add(skin.root)
            } else if (TreeSkinConstants.TREE_INPUT_CONNECTOR == skin.item.type) {
                inputConnectorSkin = skin
                root!!.children.add(skin.root)
            }
        }
    }

    override fun layoutConnectors() {
        layoutTopAndBottomConnectors()
        layoutSelectionHalo()
    }

    override fun getConnectorPosition(connectorSkin: GConnectorSkin): Point2D {
        val connectorRoot = connectorSkin.root
        val x = connectorRoot!!.layoutX + connectorSkin.width / 2
        val y = connectorRoot.layoutY + connectorSkin.height / 2
        return Point2D(x, y)
    }

    /**
     * Lays out the connectors. Inputs on top, outputs on the bottom.
     */
    private fun layoutTopAndBottomConnectors() {
        if (inputConnectorSkin != null) {
            val inputX = (root!!.width - inputConnectorSkin!!.width) / 2
            val inputY = -inputConnectorSkin!!.height / 2
            inputConnectorSkin!!.root!!.layoutX = inputX
            inputConnectorSkin!!.root!!.layoutY = inputY
        }
        if (outputConnectorSkin != null) {
            val outputX = (root!!.width - outputConnectorSkin!!.width) / 2
            val outputY = root!!.height - outputConnectorSkin!!.height / 2
            outputConnectorSkin!!.root!!.layoutX = outputX
            outputConnectorSkin!!.root!!.layoutY = outputY
        }
    }

    /**
     * Adds the selection halo and initializes some of its values.
     */
    private fun addSelectionHalo() {
        root!!.children.add(selectionHalo)
        selectionHalo.isManaged = false
        selectionHalo.isMouseTransparent = false
        selectionHalo.isVisible = false
        selectionHalo.layoutX = -HALO_OFFSET
        selectionHalo.layoutY = -HALO_OFFSET
        selectionHalo.styleClass.add(STYLE_CLASS_SELECTION_HALO)
    }

    /**
     * Lays out the selection halo based on the current width and height of the node skin region.
     */
    private fun layoutSelectionHalo() {
        if (selectionHalo.isVisible) {
            selectionHalo.width = border.width + 2 * HALO_OFFSET
            selectionHalo.height = border.height + 2 * HALO_OFFSET
            val cornerLength = 2 * HALO_CORNER_SIZE
            val xGap = border.width - 2 * HALO_CORNER_SIZE + 2 * HALO_OFFSET
            val yGap = border.height - 2 * HALO_CORNER_SIZE + 2 * HALO_OFFSET
            selectionHalo.strokeDashOffset = HALO_CORNER_SIZE
            selectionHalo.strokeDashArray.setAll(cornerLength, yGap, cornerLength, xGap)
        }
    }

    override fun selectionChanged(isSelected: Boolean) {
        if (isSelected) {
            background.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, true)
            selectionHalo.isVisible = true
            layoutSelectionHalo()
            root!!.toFront()
        } else {
            background.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, false)
            selectionHalo.isVisible = false
        }
    }

    /**
     * Removes any input and output connectors from the list of children, if they exist.
     */
    private fun removeConnectors() {
        if (inputConnectorSkin != null) {
            root!!.children.remove(inputConnectorSkin!!.root)
        }
        if (outputConnectorSkin != null) {
            root!!.children.remove(outputConnectorSkin!!.root)
        }
    }

    /**
     * Adds a button to the node skin that will add a child node when pressed.
     */
    private fun addButton() {
        StackPane.setAlignment(addChildButton, Pos.BOTTOM_RIGHT)
        addChildButton.styleClass.setAll(STYLE_CLASS_BUTTON)
        addChildButton.cursor = Cursor.DEFAULT
        addChildButton.isPickOnBounds = false
        addChildButton.graphic = AwesomeIcon.PLUS.node()
        addChildButton.onAction = EventHandler { event: ActionEvent? -> addChildNode() }
        root!!.children.add(addChildButton)
    }

    /**
     * Adds a child node with one input and one output connector, placed directly underneath its parent.
     */
    private fun addChildNode() {
        val childNode = GNode()
        childNode.type = TreeSkinConstants.TREE_NODE
        childNode.x = item!!.x + (item.width - childNode.width) / 2
        childNode.y = item.y + item.height + CHILD_Y_OFFSET
        val model = graphEditor!!.model
        val maxAllowedY = model.contentHeight - VIEW_PADDING
        if (childNode.y + childNode.height > maxAllowedY) {
            childNode.y = maxAllowedY - childNode.height
        }
        val input = GConnector()
        val output = GConnector()
        input.type = TreeSkinConstants.TREE_INPUT_CONNECTOR
        output.type = TreeSkinConstants.TREE_OUTPUT_CONNECTOR
        childNode.connectors.add(input)
        childNode.connectors.add(output)

        // This allows multiple connections to be created from the output.
        output.connectionDetachedOnDrag = false
        val parentOutput = findOutput()
        val connection = GConnection()
        connection.type = TreeSkinConstants.TREE_CONNECTION
        connection.source = parentOutput!!
        connection.target = input
        input.connections.add(connection)

        // Set the rest of the values via EMF commands because they touch the currently-edited model.
        val command = CompoundCommand()

        //command.append(AddCommand.create(editingDomain, model, NODES, childNode));
        command.append(RemoveCommand.create(model, { owner -> model.nodes }, childNode))
        //command.append(AddCommand.create(editingDomain, model, CONNECTIONS, connection));
        command.append(RemoveCommand.create(model, { owner -> model.connections }, connection))
        //command.append(AddCommand.create(editingDomain, parentOutput, CONNECTOR_CONNECTIONS, connection));  ??????
        command.append(RemoveCommand.create(parentOutput, { owner -> parentOutput.connections }, connection))
        if (command.canExecute()) {
            CommandStack.getCommandStack(model).execute(command)
        }
    }

    /**
     * Finds the output connector of this skin's node.
     *
     *
     *
     * Assumes the node has 1 or 2 connectors, and if there are 2 connectors the second is the output. Bit dodgy but
     * only used in the demo.
     *
     */
    private fun findOutput(): GConnector? {
        return if (item!!.connectors.size == 1) {
            item.connectors[0]
        } else if (item.connectors.size == 2) {
            item.connectors[1]
        } else {
            null
        }
    }

    /**
     * Stops the node being dragged if it isn't selected.
     *
     * @param event a mouse-dragged event on the node
     */
    private fun filterMouseDragged(event: MouseEvent) {
        if (event.isPrimaryButtonDown && !selected) {
            event.consume()
        }
    }

    companion object {
        private const val STYLE_CLASS_BORDER = "tree-node-border" //$NON-NLS-1$
        private const val STYLE_CLASS_BACKGROUND = "tree-node-background" //$NON-NLS-1$
        private const val STYLE_CLASS_SELECTION_HALO = "tree-node-selection-halo" //$NON-NLS-1$
        private const val STYLE_CLASS_BUTTON = "tree-node-button" //$NON-NLS-1$
        private val PSEUDO_CLASS_SELECTED = PseudoClass.getPseudoClass("selected") //$NON-NLS-1$
        private const val HALO_OFFSET = 5.0
        private const val HALO_CORNER_SIZE = 10.0
        private const val MIN_WIDTH = 81.0
        private const val MIN_HEIGHT = 61.0

        // Child nodes will be added this far below their parent.
        private const val CHILD_Y_OFFSET = 80.0
        private const val VIEW_PADDING = 15.0
    }
}