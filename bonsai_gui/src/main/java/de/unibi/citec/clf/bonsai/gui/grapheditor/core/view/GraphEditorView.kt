package de.unibi.citec.clf.bonsai.gui.grapheditor.core.view

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectionSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GJointSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GTailSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.VirtualSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.utils.SelectionBox
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.impl.GraphEditorGrid
import javafx.geometry.Insets
import javafx.scene.layout.Background
import javafx.scene.layout.BackgroundFill
import javafx.scene.layout.Border
import javafx.scene.layout.BorderStroke
import javafx.scene.layout.BorderStrokeStyle
import javafx.scene.layout.BorderWidths
import javafx.scene.layout.CornerRadii
import javafx.scene.layout.Pane
import javafx.scene.layout.Region
import javafx.scene.paint.Color
import javafx.scene.shape.StrokeLineCap
import javafx.scene.shape.StrokeLineJoin
import javafx.scene.shape.StrokeType

class GraphEditorView(var editorProperties: GraphEditorProperties): Region() {

    companion object {
        private const val STYLE_CLASS = "graph-editor"
        private const val STYLE_CLASS_NODE_LAYER = "graph-editor-node-layer"
        private const val STYLE_CLASS_CONNECTION_LAYER = "graph-editor-connection-layer"
    }

    private val nodeLayer = Pane()

    private val connectionLayer = object : Pane() {
        override fun layoutChildren() {
            super.layoutChildren()
            drawConnections()
        }
    }

    private val grid = GraphEditorGrid()

    var connectionLayouter: ConnectionLayouter? = null

    private val selectionBox = SelectionBox()

    init {
        styleClass.addAll(STYLE_CLASS)

        border = Border(BorderStroke(Color.valueOf("08ff80"), BorderStrokeStyle(
            StrokeType.INSIDE,
            StrokeLineJoin.MITER,
            StrokeLineCap.BUTT,
            10.0,
            0.0,
            null
        ), CornerRadii(0.0), BorderWidths(8.0)))

        maxWidth = GraphEditorProperties.DEFAULT_MAX_WIDTH
        maxHeight = GraphEditorProperties.DEFAULT_MAX_HEIGHT

        initializeLayers()

        grid.visibleProperty().bind(editorProperties.gridVisibleProperty())
        grid.gridSpacingProperty().bind(editorProperties.gridSpacingProperty())
    }

    fun clear() {
        nodeLayer.children.clear()
        connectionLayer.children.clear()
    }

    fun add(nodeSkin: GNodeSkin) {
        if (nodeSkin !is VirtualSkin) nodeLayer.children.add(nodeSkin.root)
    }

    fun add(connectionSkin: GConnectionSkin) {
        if (connectionSkin !is VirtualSkin) connectionLayer.children.add(connectionSkin.root)
    }

    fun add(jointSkin: GJointSkin) {
        if (jointSkin !is VirtualSkin) connectionLayer.children.add(jointSkin.root)
    }

    fun add(tailSkin: GTailSkin) {
        if (tailSkin !is VirtualSkin) connectionLayer.children.add(0, tailSkin.root)
    }

    fun remove(nodeSkin: GNodeSkin) {
        if (nodeSkin !is VirtualSkin) nodeLayer.children.remove(nodeSkin.root)
    }

    fun remove(connectionSkin: GConnectionSkin) {
        if (connectionSkin !is VirtualSkin) connectionLayer.children.remove(connectionSkin.root)
    }

    fun remove(jointSkin: GJointSkin) {
        if (jointSkin !is VirtualSkin) connectionLayer.children.remove(jointSkin.root)
    }

    fun remove(tailSkin: GTailSkin) {
        if (tailSkin !is VirtualSkin) connectionLayer.children.remove(tailSkin.root)
    }

    fun drawSelectionBox(x: Double, y: Double, width: Double, height: Double) {
        selectionBox.draw(x, y, width, height)
    }

    fun hideSelectionBox() {
        selectionBox.isVisible = false
    }

    override fun layoutChildren() {
        nodeLayer.resizeRelocate(0.0, 0.0, width, height)
        connectionLayer.resizeRelocate(0.0, 0.0, width, height)
        grid.resizeRelocate(0.0, 0.0, width, height)
        drawConnections()
    }

    private fun drawConnections() {
        connectionLayouter?.draw()
    }

    private fun initializeLayers() {
        nodeLayer.isPickOnBounds = false
        connectionLayer.isPickOnBounds = false

        nodeLayer.styleClass.add(STYLE_CLASS_NODE_LAYER)
        connectionLayer.styleClass.add(STYLE_CLASS_CONNECTION_LAYER)

        children.addAll(grid, connectionLayer, nodeLayer, selectionBox)
    }




}