package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connectors.DefaultConnectorTypes
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.css.PseudoClass
import javafx.geometry.Point2D
import javafx.geometry.Side
import javafx.scene.input.MouseEvent
import javafx.scene.shape.Rectangle
import org.apache.log4j.Logger

class DefaultNodeSkin(node: GNode) : GNodeSkin(node) {

    companion object {
        private val LOGGER = Logger.getLogger(DefaultNodeSkin::class.java)

        private const val STYLE_CLASS_BORDER = "default-node-border"
        private const val STYLE_CLASS_BACKGROUND = "default-node-background"
        private const val STYLE_CLASS_SELECTION_HALO = "default-node-selection-halo"

        private val PSEUDO_CLASS_SELECTED = PseudoClass.getPseudoClass("selected")

        private const val HALO_OFFSET = 5.0
        private const val HALO_CORNER_SIZE = 10.0

        private const val MINOR_POSITIVE_OFFSET = 2.0
        private const val MINOR_NEGATIVE_OFFSET = -3.0

        private const val MIN_WIDTH = 41.0
        private const val MIN_HEIGHT = 41.0
    }

    private val selectionHalo = Rectangle()

    private val topConnectorSkins: MutableList<GConnectorSkin> = mutableListOf()
    private val rightConnectorSkins: MutableList<GConnectorSkin> = mutableListOf()
    private val bottomConnectorSkins: MutableList<GConnectorSkin> = mutableListOf()
    private val leftConnectorSkins: MutableList<GConnectorSkin> = mutableListOf()

    private val border = Rectangle()
    private val background = Rectangle()

    init {
        performChecks()

        background.widthProperty().bind(border.widthProperty().subtract(border.strokeWidthProperty().multiply(2)))
        background.heightProperty().bind(border.heightProperty().subtract(border.strokeWidthProperty().multiply(2)))

        border.widthProperty().bind(root?.widthProperty())
        border.heightProperty().bind(root?.heightProperty())

        border.styleClass.setAll(STYLE_CLASS_BORDER)
        background.styleClass.setAll(STYLE_CLASS_BACKGROUND)

        root?.children?.addAll(border, background)
        root?.setMinSize(MIN_WIDTH, MIN_HEIGHT)

        background.addEventFilter(MouseEvent.MOUSE_DRAGGED, this::filterMouseDragged)

        addSelectionHalo()
    }


    override fun setConnectorSkins(connectorSkins: List<GConnectorSkin>) {
        removeAllConnectors()

        topConnectorSkins.clear()
        rightConnectorSkins.clear()
        bottomConnectorSkins.clear()
        leftConnectorSkins.clear()

        connectorSkins.forEach { connectorSkin ->
            val type = connectorSkin.item?.type
            when {
                DefaultConnectorTypes.isTop(type) -> topConnectorSkins.add(connectorSkin)
                DefaultConnectorTypes.isRight(type) -> rightConnectorSkins.add(connectorSkin)
                DefaultConnectorTypes.isBottom(type) -> bottomConnectorSkins.add(connectorSkin)
                DefaultConnectorTypes.isLeft(type) -> leftConnectorSkins.add(connectorSkin)
            }
            root?.children?.add(connectorSkin.root)
        }
        layoutConnectors()
    }

    override fun layoutConnectors() {
        layoutAllConnectors()
        layoutSelectionHalo()
    }

    override fun getConnectorPosition(connectorSkin: GConnectorSkin): Point2D {
        val side = DefaultConnectorTypes.getSide(connectorSkin.item?.type)
        var x = 0.0
        var y = 0.0
        connectorSkin.root?.let {
            when (side) {
                Side.LEFT -> y = it.layoutY + connectorSkin.getHeight() / 2
                Side.RIGHT -> {
                    x = root?.width ?: 0.0
                    y = it.layoutY + connectorSkin.getHeight() / 2
                }

                Side.TOP -> x = it.layoutX + connectorSkin.getWidth() / 2
                else -> {
                    x = it.layoutX + connectorSkin.getWidth() / 2
                    y = root?.height ?: 0.0
                }
            }
        }
        return Point2D(x, y)
    }

    private fun performChecks() {
        item?.let { item ->
            for (connector in item.connectors) {
                connector.type?.let {
                    if (!DefaultConnectorTypes.isValid(it)) {
                        LOGGER.error("Connector type $it not recognized, setting to 'left-input'.")
                        connector.type = DefaultConnectorTypes.LEFT_INPUT
                    }
                }

            }
        }
    }

    private fun layoutAllConnectors() {
        layoutConnectors(topConnectorSkins, false, 0.0)
        layoutConnectors(rightConnectorSkins, true, root?.width ?: 0.0)
        layoutConnectors(bottomConnectorSkins, false, root?.height ?: 0.0)
        layoutConnectors(leftConnectorSkins, true, 0.0)
    }

    private fun layoutConnectors(connectorSkins: List<GConnectorSkin>, vertical: Boolean, offset: Double) {
        for (connectorSkin in connectorSkins.withIndex()) {
            if (vertical) {
                val offsetY = (root?.height ?: 0.0) / (connectorSkins.size + 1)
                val offsetX = connectorSkin.value.item?.let { getMinorOffsetX(it) } ?: 0.0
                connectorSkin.value.root?.layoutX = GeometryUtils.moveOnPixel(offset - connectorSkin.value.getWidth() / 2 + offsetX)
                connectorSkin.value.root?.layoutY = GeometryUtils.moveOnPixel((connectorSkin.index + 1) * offsetY - connectorSkin.value.getHeight() / 2)
            } else {
                val offsetX = (root?.width ?: 0.0) / (connectorSkins.size + 1)
                val offsetY = connectorSkin.value.item?.let { getMinorOffsetY(it) } ?: 0.0
                connectorSkin.value.root?.layoutX = GeometryUtils.moveOnPixel((connectorSkin.index + 1) * offsetX - connectorSkin.value.getWidth() / 2)
                connectorSkin.value.root?.layoutY = GeometryUtils.moveOnPixel(offset - connectorSkin.value.getHeight() / 2 + offsetY)
            }
        }
    }

    private fun addSelectionHalo() {
        root?.children?.add(selectionHalo)

        selectionHalo.isManaged = false
        selectionHalo.isMouseTransparent = false
        selectionHalo.isVisible = false

        selectionHalo.layoutX = -HALO_OFFSET
        selectionHalo.layoutY = -HALO_OFFSET

        selectionHalo.styleClass.add(STYLE_CLASS_SELECTION_HALO)
    }

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
            selectionHalo.isVisible = true
            layoutSelectionHalo()
            background.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, true)
            root?.toFront()
        } else {
            selectionHalo.isVisible = false
            background.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, false)
        }
    }

    private fun removeAllConnectors() {
        listOf(topConnectorSkins, rightConnectorSkins, bottomConnectorSkins, leftConnectorSkins).forEach {
            it.forEach { skin -> root?.children?.remove(skin.root) }
        }
    }

    private fun getMinorOffsetX(connector: GConnector): Double {
        connector.type.let {
            return if (it == DefaultConnectorTypes.LEFT_INPUT || it == DefaultConnectorTypes.RIGHT_OUTPUT) {
                MINOR_POSITIVE_OFFSET
            } else {
                MINOR_NEGATIVE_OFFSET
            }
        }
    }

    private fun getMinorOffsetY(connector: GConnector): Double {
        connector.type.let {
            return if (it == DefaultConnectorTypes.TOP_INPUT || it == DefaultConnectorTypes.BOTTOM_OUTPUT) {
                MINOR_POSITIVE_OFFSET
            } else {
                MINOR_NEGATIVE_OFFSET
            }
        }
    }

    private fun filterMouseDragged(event: MouseEvent) {
        if (event.isPrimaryButtonDown && !selected) event.consume()
    }


}