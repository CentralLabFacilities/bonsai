package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.bonsai

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils.moveOnPixel
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.adapters.SlotAdapter
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.adapters.VariableAdapter
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.bonsai.utils.SkillParamsTableGenerator
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.utils.AwesomeIcon
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.Skill
import javafx.css.PseudoClass
import javafx.event.EventHandler
import javafx.geometry.Point2D
import javafx.geometry.Pos
import javafx.scene.Cursor
import javafx.scene.control.Button
import javafx.scene.control.Label
import javafx.scene.control.TableView
import javafx.scene.control.TextField
import javafx.scene.input.MouseEvent
import javafx.scene.layout.HBox
import javafx.scene.layout.Priority
import javafx.scene.layout.Region
import javafx.scene.layout.VBox
import javafx.scene.shape.Rectangle
import java.util.Locale.getDefault

class BonsaiNodeSkin(node: GNode) : GNodeSkin(node) {

    companion object {

        private const val STYLE_CLASS_BORDER = "titled-node-border"
        private const val STYLE_CLASS_BACKGROUND = "titled-node-background"
        private const val STYLE_CLASS_SELECTION_HALO = "titled-node-selection-halo"
        private const val STYLE_CLASS_HEADER = "titled-node-header"
        private const val STYLE_CLASS_TITLE = "titled-node-title"
        private const val STYLE_CLASS_BUTTON = "titled-node-close-button"


        private val PSEUDO_CLASS_SELECTED = PseudoClass.getPseudoClass("selected")

        private const val MIN_WIDTH = 300.0
        private const val MIN_HEIGHT = 1000.0
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
    private var tableSlots = TableView<SlotAdapter>()
    private var tableReqVars = TableView<VariableAdapter>()
    private var tableOptVars = TableView<VariableAdapter>()
    private val slotsAdapted = mutableListOf<SlotAdapter>()
    private val optVarsAdapted = mutableListOf<VariableAdapter>()
    private val reqVarsAdapted = mutableListOf<VariableAdapter>()
    private val title = Label()

    private var inputConnectorSkin: GConnectorSkin? = null
    private var successOutputConnectorSkin: GConnectorSkin? = null
    private var errorOutputConnectorSkin: GConnectorSkin? = null
    private var fatalOutputConnectorSkin: GConnectorSkin? = null

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
        removeAllConnectors()
        for (skin in connectorSkins) {
            when (skin.item?.type) {
                BonsaiSkinConstants.BONSAI_INBOUND_CONNECTOR -> {
                    inputConnectorSkin = skin
                    root?.children?.add(skin.root)
                }

                BonsaiSkinConstants.BONSAI_OUTBOUND_SUCCESS_CONNECTOR -> {
                    successOutputConnectorSkin = skin
                    root?.children?.add(skin.root)
                }

                BonsaiSkinConstants.BONSAI_OUTBOUND_ERROR_CONNECTOR -> {
                    errorOutputConnectorSkin = skin
                    root?.children?.add(skin.root)
                }

                BonsaiSkinConstants.BONSAI_OUTBOUND_FATAL_CONNECTOR -> {
                    fatalOutputConnectorSkin = skin
                    root?.children?.add(skin.root)
                }

                else -> {}
            }
        }
    }

    private fun removeAllConnectors() {
        root?.children?.apply {
            remove(inputConnectorSkin?.root)
            remove(successOutputConnectorSkin?.root)
            remove(errorOutputConnectorSkin?.root)
            remove(fatalOutputConnectorSkin?.root)
        }
    }

    override fun layoutConnectors() {
        layoutLeftAndRightConnectors()
        layoutSelectionHalo()
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
        setConnectorsSelected()
    }

    /**
     * Adds or removes the 'selected' pseudo-class from all connectors belonging to this node.
     */
    private fun setConnectorsSelected() {
        val editor = graphEditor ?: return
        inputConnectorSkin?.let { editor.selectionManager.select(it.item as Selectable) }
        successOutputConnectorSkin?.let { editor.selectionManager.select(it.item as Selectable) }
        errorOutputConnectorSkin?.let { editor.selectionManager.select(it.item as Selectable) }
        fatalOutputConnectorSkin?.let { editor.selectionManager.select(it.item as Selectable) }
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

    private fun processSlot(slot: Map.Entry<String, Skill.Slot>): HBox {
        return HBox().apply {
            children += Label().apply { text = slot.key }
            children += Label().apply { text = slot.value.dataType.simpleName }
            children += TextField().apply { text = slot.value.xpath }
        }
    }

    private fun processVar(variable: Map.Entry<String, Skill.Variable>): HBox {
        return HBox().apply {
            children += Label().apply { text = variable.key }
            children += Label().apply { text = variable.value.dataType.simpleName }
            children += TextField().apply { text = variable.value.expression.toString() }
        }
    }

    private fun slotToSlotAdapter(slot: Map.Entry<String, Skill.Slot>): SlotAdapter {
        return SlotAdapter(slot.key, slot.value)
    }

    private fun varToVarAdapter(variable: Map.Entry<String, Skill.Variable>): VariableAdapter {
        return VariableAdapter(variable.key, variable.value)
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
                val noSlotLabel = Label().apply { text = "No Slots found" }
                val reqVarsLabel = Label().apply { text = "Required Vars:" }
                val noReqVarsLabel = Label().apply { text = "No required Vars found" }
                val optVarsLabel = Label().apply { text = "Optional Vars:" }
                val noOptVarsLabel = Label().apply { text = "No optional Vars found" }
                val transitionLabel = Label().apply { text = "Transitions:" }

                item.state?.let { state ->

                    state.skill?.let { skill ->

                        skill.status.forEach { status ->
                            transitions.children += HBox().apply {
                                val transitionFiller = Region()
                                HBox.setHgrow(filler, Priority.ALWAYS)
                                children += transitionFiller
                                children += Label().apply {
                                    text = if (status.statusSuffix == "") {
                                        status.status.toString().lowercase(getDefault())
                                    } else {
                                        status.status.toString().lowercase(getDefault()).plus(".")
                                            .plus(status.statusSuffix)
                                    }
                                }
                            }
                        }
                        contentRoot.children.addAll(
                            header,
                            transitionLabel,
                            transitions
                        )

                        skill.slots.forEach {
                            slotsAdapted += slotToSlotAdapter(it)
                        }
                        if (slotsAdapted.isNotEmpty()) {
                            contentRoot.children.addAll(
                                slotLabel,
                                SkillParamsTableGenerator.generateSlotTable(slotsAdapted)
                            )
                        } else {
                            contentRoot.children += noSlotLabel
                        }
                        skill.requiredVars.forEach {
                            reqVarsAdapted += varToVarAdapter(it)
                        }
                        if (reqVarsAdapted.isNotEmpty()) {
                            contentRoot.children.addAll(
                                reqVarsLabel,
                                SkillParamsTableGenerator.generateVarsTable(reqVarsAdapted)
                            )
                        } else {
                            contentRoot.children += noReqVarsLabel
                        }
                        skill.optionalVars.forEach {
                            optVarsAdapted += varToVarAdapter(it)
                        }
                        if (optVarsAdapted.isNotEmpty()) {
                            contentRoot.children.addAll(
                                optVarsLabel,
                                SkillParamsTableGenerator.generateVarsTable(optVarsAdapted)
                            )
                        } else {
                            contentRoot.children += noOptVarsLabel
                        }


                    }
                }
                root!!.children.add(contentRoot)
                closeButton.graphic = AwesomeIcon.TIMES.node()
                closeButton.cursor = Cursor.DEFAULT
                closeButton.onAction = EventHandler { Commands.removeNode(graphEditor!!.model, item) }
                contentRoot.minWidthProperty().bind(root!!.widthProperty())
                contentRoot.prefWidthProperty().bind(root!!.widthProperty())
                contentRoot.maxWidthProperty().bind(root!!.widthProperty())
                contentRoot.minHeightProperty().bind(root!!.heightProperty())
                contentRoot.prefHeightProperty().bind(root!!.heightProperty())
                contentRoot.maxHeightProperty().bind(root!!.heightProperty())
                contentRoot.layoutX = BORDER_WIDTH
                contentRoot.layoutY = BORDER_WIDTH
                contentRoot.styleClass.setAll(STYLE_CLASS_BACKGROUND)
            }

            else -> throw IllegalArgumentException("Cannot build BonsaiNodeSkin from non-GNode object!")
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

    private fun layoutLeftAndRightConnectors() {
        inputConnectorSkin?.let { skin ->
            skin.root?.layoutX = moveOnPixel(0 - skin.width / 2)
        }
    }


}