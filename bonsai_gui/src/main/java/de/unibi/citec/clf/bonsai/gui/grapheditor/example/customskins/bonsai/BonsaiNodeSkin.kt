package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.bonsai

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.css.PseudoClass
import javafx.geometry.Point2D
import javafx.scene.control.Label
import javafx.scene.input.MouseEvent
import javafx.scene.layout.HBox
import javafx.scene.layout.VBox
import javafx.scene.shape.Rectangle

class BonsaiNodeSkin(node: GNode): GNodeSkin(node) {

    companion object {

        private const val STYLE_CLASS_BORDER = ""
        private const val STYLE_CLASS_BACKGROUND = ""
        private const val STYLE_CLASS_SELECTION_HALO = ""
        private const val STYLE_CLASS_HEADER = ""
        private const val STYLE_CLASS_TITLE = ""



        private val PSEUDO_CLASS_SELECTED = PseudoClass.getPseudoClass("selected")

        private const val MIN_WIDTH = 81.0
        private const val MIN_HEIGHT = 102.0
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
    private val title = Label()

    private val inputConnectorSkins = mutableListOf<GConnectorSkin>()
    private val outputConnectorSkins = mutableListOf<GConnectorSkin>()

    private val border = Rectangle()

    init {
        border.styleClass.setAll(STYLE_CLASS_BORDER)
        border.widthProperty().bind(root?.widthProperty())
        border.heightProperty().bind(root?.heightProperty())

        root?.children?.add(border)
        root?.setMinSize(MIN_WIDTH, MIN_HEIGHT)

        addSelectionHalo()

        createContent()

        contentRoot.addEventFilter(MouseEvent.MOUSE_DRAGGED) { event: MouseEvent -> filterMouseDragged(event) }
    }

    override fun setConnectorSkins(connectorSkins: List<GConnectorSkin>) {
        TODO("Not yet implemented")
    }

    override fun layoutConnectors() {
        TODO("Not yet implemented")
    }

    override fun getConnectorPosition(connectorSkin: GConnectorSkin): Point2D {
        TODO("Not yet implemented")
    }

    override fun selectionChanged(isSelected: Boolean) {
        TODO("Not yet implemented")
    }

    private fun addSelectionHalo() {

    }

    private fun createContent() {

    }

    private fun filterMouseDragged(event: MouseEvent) {

    }


}