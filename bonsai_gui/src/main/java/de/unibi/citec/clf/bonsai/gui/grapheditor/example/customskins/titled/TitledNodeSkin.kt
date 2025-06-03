package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.titled

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.removeNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils.moveOnPixel
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.utils.AwesomeIcon
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import javafx.css.PseudoClass
import javafx.event.ActionEvent
import javafx.event.EventHandler
import javafx.geometry.Point2D
import javafx.geometry.Pos
import javafx.scene.Cursor
import javafx.scene.control.Button
import javafx.scene.control.Label
import javafx.scene.input.MouseEvent
import javafx.scene.layout.HBox
import javafx.scene.layout.Priority
import javafx.scene.layout.Region
import javafx.scene.layout.VBox
import javafx.scene.shape.Rectangle

/**
 * A grey node with a navy title-bar for the 'titled-skins' theme.
 */
class TitledNodeSkin(node: GNode?) : GNodeSkin(node!!) {
    private val selectionHalo = Rectangle()
    private val contentRoot = VBox()
    private val header = HBox()
    private val title = Label()
    private val inputConnectorSkins: MutableList<GConnectorSkin> = ArrayList()
    private val outputConnectorSkins: MutableList<GConnectorSkin> = ArrayList()
    private val border = Rectangle()

    /**
     * Creates a new [TitledNodeSkin] instance.
     *
     * @param node the {link GNode} this skin is representing
     */
    init {
        border.styleClass.setAll(STYLE_CLASS_BORDER)
        border.widthProperty().bind(root!!.widthProperty())
        border.heightProperty().bind(root!!.heightProperty())
        root!!.children.add(border)
        root!!.setMinSize(MIN_WIDTH, MIN_HEIGHT)
        addSelectionHalo()
        createContent()
        contentRoot.addEventFilter(MouseEvent.MOUSE_DRAGGED) { event: MouseEvent -> filterMouseDragged(event) }
    }

    override fun initialize() {
        super.initialize()
        title.text = TITLE_TEXT + item!!.id
    }

    override fun setConnectorSkins(connectorSkins: List<GConnectorSkin>) {
        removeAllConnectors()
        inputConnectorSkins.clear()
        outputConnectorSkins.clear()
        for (connectorSkin in connectorSkins) {
            val isInput = connectorSkin.item?.type?.contains("input")  ?: false//$NON-NLS-1$
            val isOutput = connectorSkin.item?.type?.contains("output") ?: false //$NON-NLS-1$
            if (isInput) {
                inputConnectorSkins.add(connectorSkin)
            } else if (isOutput) {
                outputConnectorSkins.add(connectorSkin)
            }
            if (isInput || isOutput) {
                root!!.children.add(connectorSkin.root)
            }
        }
        setConnectorsSelected()
    }

    override fun layoutConnectors() {
        layoutLeftAndRightConnectors()
        layoutSelectionHalo()
    }

    override fun getConnectorPosition(connectorSkin: GConnectorSkin): Point2D {
        val connectorRoot = connectorSkin.root
        val x = connectorRoot!!.layoutX + connectorSkin.getWidth() / 2
        val y = connectorRoot.layoutY + connectorSkin.getHeight() / 2
        return if (inputConnectorSkins.contains(connectorSkin)) {
            Point2D(x, y)
        } else Point2D(x - 1, y)
        // ELSE:
        // Subtract 1 to align start-of-connection correctly. Compensation for rounding errors?
    }

    /**
     * Creates the content of the node skin - header, title, close button, etc.
     */
    private fun createContent() {
        header.styleClass.setAll(STYLE_CLASS_HEADER)
        header.alignment = Pos.CENTER
        title.styleClass.setAll(STYLE_CLASS_TITLE)
        val filler = Region()
        HBox.setHgrow(filler, Priority.ALWAYS)
        val closeButton = Button()
        closeButton.styleClass.setAll(STYLE_CLASS_BUTTON)
        header.children.addAll(title, filler, closeButton)
        contentRoot.children.add(header)
        root!!.children.add(contentRoot)
        closeButton.graphic = AwesomeIcon.TIMES.node()
        closeButton.cursor = Cursor.DEFAULT
        closeButton.onAction = EventHandler { event: ActionEvent? -> removeNode(graphEditor!!.model, item!!) }
        contentRoot.minWidthProperty().bind(root!!.widthProperty())
        contentRoot.prefWidthProperty().bind(root!!.widthProperty())
        contentRoot.maxWidthProperty().bind(root!!.widthProperty())
        contentRoot.minHeightProperty().bind(root!!.heightProperty())
        contentRoot.prefHeightProperty().bind(root!!.heightProperty())
        contentRoot.maxHeightProperty().bind(root!!.heightProperty())
        contentRoot.layoutX = BORDER_WIDTH.toDouble()
        contentRoot.layoutY = BORDER_WIDTH.toDouble()
        contentRoot.styleClass.setAll(STYLE_CLASS_BACKGROUND)
    }

    /**
     * Lays out all connectors.
     */
    private fun layoutLeftAndRightConnectors() {
        val inputCount = inputConnectorSkins.size
        val inputOffsetY = (root!!.height - HEADER_HEIGHT) / (inputCount + 1)
        for (i in 0 until inputCount) {
            val inputSkin = inputConnectorSkins[i]
            val connectorRoot = inputSkin.root
            val layoutX = moveOnPixel(0 - inputSkin.getWidth() / 2)
            val layoutY = moveOnPixel((i + 1) * inputOffsetY - inputSkin.getHeight() / 2)
            connectorRoot!!.layoutX = layoutX
            connectorRoot.layoutY = layoutY + HEADER_HEIGHT
        }
        val outputCount = outputConnectorSkins.size
        val outputOffsetY = (root!!.height - HEADER_HEIGHT) / (outputCount + 1)
        for (i in 0 until outputCount) {
            val outputSkin = outputConnectorSkins[i]
            val connectorRoot = outputSkin.root
            val layoutX = moveOnPixel(root!!.width - outputSkin.getWidth() / 2)
            val layoutY = moveOnPixel((i + 1) * outputOffsetY - outputSkin.getHeight() / 2)
            connectorRoot!!.layoutX = layoutX
            connectorRoot.layoutY = layoutY + HEADER_HEIGHT
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
            selectionHalo.width = root!!.width + 2 * HALO_OFFSET
            selectionHalo.height = root!!.height + 2 * HALO_OFFSET
            val cornerLength = 2 * HALO_CORNER_SIZE
            val xGap = root!!.width - 2 * HALO_CORNER_SIZE + 2 * HALO_OFFSET
            val yGap = root!!.height - 2 * HALO_CORNER_SIZE + 2 * HALO_OFFSET
            selectionHalo.strokeDashOffset = HALO_CORNER_SIZE
            selectionHalo.strokeDashArray.setAll(cornerLength, yGap, cornerLength, xGap)
        }
    }

    override fun selectionChanged(isSelected: Boolean) {
        if (isSelected) {
            selectionHalo.isVisible = true
            layoutSelectionHalo()
            contentRoot.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, true)
            root!!.toFront()
        } else {
            selectionHalo.isVisible = false
            contentRoot.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, false)
        }
        setConnectorsSelected()
    }

    /**
     * Removes any input and output connectors from the list of children, if they exist.
     */
    private fun removeAllConnectors() {
        for (connectorSkin in inputConnectorSkins) {
            root!!.children.remove(connectorSkin.root)
        }
        for (connectorSkin in outputConnectorSkins) {
            root!!.children.remove(connectorSkin.root)
        }
    }

    /**
     * Adds or removes the 'selected' pseudo-class from all connectors belonging to this node.
     */
    private fun setConnectorsSelected() {
        val editor = graphEditor ?: return
        for (skin in inputConnectorSkins) {
            if (skin is TitledConnectorSkin) {
                editor.selectionManager.select<Selectable>(skin.item as Selectable)
            }
        }
        for (skin in outputConnectorSkins) {
            if (skin is TitledConnectorSkin) {
                editor.selectionManager.select<Selectable>(skin.item as Selectable)
            }
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
        private const val TITLE_TEXT = "Node " //$NON-NLS-1$
        private const val STYLE_CLASS_BORDER = "titled-node-border" //$NON-NLS-1$
        private const val STYLE_CLASS_BACKGROUND = "titled-node-background" //$NON-NLS-1$
        private const val STYLE_CLASS_SELECTION_HALO = "titled-node-selection-halo" //$NON-NLS-1$
        private const val STYLE_CLASS_HEADER = "titled-node-header" //$NON-NLS-1$
        private const val STYLE_CLASS_TITLE = "titled-node-title" //$NON-NLS-1$
        private const val STYLE_CLASS_BUTTON = "titled-node-close-button" //$NON-NLS-1$
        private val PSEUDO_CLASS_SELECTED = PseudoClass.getPseudoClass("selected") //$NON-NLS-1$
        private const val HALO_OFFSET = 5.0
        private const val HALO_CORNER_SIZE = 10.0
        private const val MIN_WIDTH = 81.0
        private const val MIN_HEIGHT = 81.0
        private const val BORDER_WIDTH = 1
        private const val HEADER_HEIGHT = 20
    }
}