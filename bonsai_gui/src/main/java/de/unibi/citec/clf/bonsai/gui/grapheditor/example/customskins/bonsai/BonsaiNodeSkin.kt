package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.bonsai

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.titled.TitledConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.titled.TitledNodeSkin
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
import javafx.scene.control.TextField
import javafx.scene.input.MouseEvent
import javafx.scene.layout.HBox
import javafx.scene.layout.Priority
import javafx.scene.layout.Region
import javafx.scene.layout.VBox
import javafx.scene.shape.Rectangle
import java.lang.IllegalArgumentException

class BonsaiNodeSkin(node: GNode): GNodeSkin(node) {

    companion object {

        private const val STYLE_CLASS_BORDER = "titled-node-border"
        private const val STYLE_CLASS_BACKGROUND = "titled-node-background"
        private const val STYLE_CLASS_SELECTION_HALO = "titled-node-selection-halo"
        private const val STYLE_CLASS_HEADER = "titled-node-header"
        private const val STYLE_CLASS_TITLE = "titled-node-title"
        private const val STYLE_CLASS_BUTTON = "titled-node-close-button"



        private val PSEUDO_CLASS_SELECTED = PseudoClass.getPseudoClass("selected")

        private const val MIN_WIDTH = 300.0
        private const val MIN_HEIGHT = 800.0
        private const val BORDER_WIDTH = 1.0
        private const val HEADER_HEIGHT = 20.0
        private const val TRANSITIONS_HEIGHT = 40.0
        private const val SLOTS_HEIGHT = 40.0

        private const val HALO_OFFSET = 5.0
        private const val HALO_CORNER_SIZE = 10.0
    }

    private val selectionHalo = Rectangle()

    private val contentRoot = VBox()
    private val header = HBox()
    private val transitions = VBox()
    private val slots = VBox()
    private val optVars = VBox()
    private val reqVars = VBox()
    private val title = Label()

    private val inputConnectorSkins = mutableListOf<GConnectorSkin>()
    private val outputConnectorSkins = mutableListOf<GConnectorSkin>()

    private val border = Rectangle()

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

    override fun setConnectorSkins(connectorSkins: List<GConnectorSkin>) {
    }

    override fun layoutConnectors() {
    }

    override fun getConnectorPosition(connectorSkin: GConnectorSkin): Point2D {
        return Point2D.ZERO
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
        //setConnectorsSelected()
    }

    private fun setConnectorsSelected() {
        val editor = graphEditor ?: return
        for (skin in inputConnectorSkins) {
            if (skin is TitledConnectorSkin) {
                editor.selectionManager.select(skin.item as Selectable)
            }
        }
        for (skin in outputConnectorSkins) {
            if (skin is TitledConnectorSkin) {
                editor.selectionManager.select(skin.item as Selectable)
            }
        }
    }

    private fun addSelectionHalo() {
        root!!.children.add(selectionHalo)
        selectionHalo.isManaged = false
        selectionHalo.isMouseTransparent = false
        selectionHalo.isVisible = false
        selectionHalo.layoutX = -HALO_OFFSET
        selectionHalo.layoutY = -HALO_OFFSET
        selectionHalo.styleClass.add(STYLE_CLASS_SELECTION_HALO)
    }

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

    private fun createContent() {
        when (item) {
            is GNode -> {
                //HEADER
                header.styleClass.setAll(STYLE_CLASS_HEADER)
                header.alignment = Pos.CENTER
                title.text = item.state?.skill?.name
                title.styleClass.setAll(STYLE_CLASS_TITLE)
                val filler = Region()
                HBox.setHgrow(filler, Priority.ALWAYS)
                val closeButton = Button()
                closeButton.styleClass.setAll(STYLE_CLASS_BUTTON)
                header.children.addAll(title, filler, closeButton)

                val slotLabel = Label().apply { text = "Slots:" }
                val reqVarsLabel = Label().apply { text = "Required Vars:" }
                val optVarsLabel = Label().apply { text = "Optional Vars:" }

                item.state?.let { state ->
                    state.skill?.let { skill ->
                        skill.readSlots.forEach { (xpath, name) ->
                            val hBox = HBox().apply {
                                val label = Label().apply { text = name }
                                val textField = TextField().apply { text = xpath }
                                children.addAll(label, textField)
                                children.forEach { HBox.setHgrow(it, Priority.ALWAYS) }
                            }
                            VBox.setVgrow(hBox, Priority.ALWAYS)
                            slots.children.add(hBox)
                        }
                        skill.writeSlots.forEach { (xpath, name) ->
                            if (xpath in skill.readSlots) return@forEach
                            val hBox = HBox().apply {
                                val label = Label().apply { text = name }
                                val textField = TextField().apply { text = xpath }
                                children.addAll(label, textField)
                                children.forEach { HBox.setHgrow(it, Priority.ALWAYS) }
                            }
                            VBox.setVgrow(hBox, Priority.ALWAYS)
                            slots.children.add(hBox)
                        }
                        skill.requiredVars.forEach { (id, expression) ->
                            val hBox = HBox().apply {
                                val label = Label().apply { text = id }
                                val textField = TextField().apply { text = expression }
                                children.addAll(label, textField)
                                children.forEach { HBox.setHgrow(it, Priority.ALWAYS) }
                            }
                            VBox.setVgrow(hBox, Priority.ALWAYS)
                            reqVars.children.add(hBox)
                        }
                        skill.optionalVars.forEach { (id, expression) ->
                            val hBox = HBox().apply {
                                val label = Label().apply { text = id }
                                val textField = TextField().apply { text = expression }
                                children.addAll(label, textField)
                                children.forEach { HBox.setHgrow(it, Priority.ALWAYS) }
                            }
                            VBox.setVgrow(hBox, Priority.ALWAYS)
                            optVars.children.add(hBox)
                        }
                    }
                }

                contentRoot.children.addAll(header, slotLabel, slots, reqVarsLabel, reqVars, optVarsLabel, optVars)
                contentRoot.children.forEach { VBox.setVgrow(it, Priority.ALWAYS) }
                root!!.children.add(contentRoot)
                root!!.isManaged = false
                root!!.resize(MIN_WIDTH, MIN_HEIGHT)
                println("Root size is ${root!!.width} x ${root!!.height}")
                root!!.setMinSize(MIN_WIDTH, MIN_HEIGHT)
                closeButton.graphic = AwesomeIcon.TIMES.node()
                closeButton.cursor = Cursor.DEFAULT
                closeButton.onAction = EventHandler { Commands.removeNode(graphEditor!!.model, item) }
                println("Width root: ${root!!.widthProperty().get()}, min width root: ${root!!.minWidthProperty().get()}")
                contentRoot.minWidthProperty().bind(root!!.widthProperty())
                //contentRoot.prefWidthProperty().bind(root!!.widthProperty())
                contentRoot.prefWidth = MIN_WIDTH
                contentRoot.maxWidthProperty().bind(root!!.widthProperty())
                contentRoot.minHeightProperty().bind(root!!.heightProperty())
                //contentRoot.prefHeightProperty().bind(root!!.heightProperty())
                contentRoot.prefHeight = MIN_HEIGHT
                contentRoot.maxHeightProperty().bind(root!!.heightProperty())
                println("Width contentRoot: ${contentRoot.widthProperty().get()}, min width contentRoot: ${contentRoot.minWidthProperty().get()}")
                contentRoot.layoutX = BORDER_WIDTH
                contentRoot.layoutY = BORDER_WIDTH
                contentRoot.styleClass.setAll(STYLE_CLASS_BACKGROUND)
                println("Added BonsaiNode")
            }
            else -> throw IllegalArgumentException("Cannot build BonsaiNodeSkin from non-GNode object!")
        }

    }

    private fun filterMouseDragged(event: MouseEvent) {
        if (event.isPrimaryButtonDown && !selected) {
            event.consume()
        }
    }


}