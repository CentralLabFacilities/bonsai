package de.unibi.citec.clf.bonsai.gui.view.graph

import de.unibi.citec.clf.bonsai.gui.controller.graph.BonsaiGraphMouseHandler
import de.unibi.citec.clf.bonsai.gui.controller.graph.BonsaiGraphZoomHandler
import de.unibi.citec.clf.bonsai.gui.controller.graph.tools.BonsaiGraphAreaSelectionTool
import de.unibi.citec.clf.bonsai.gui.controller.graph.tools.BonsaiGraphMovePaneTool
import de.unibi.citec.clf.bonsai.gui.controller.graph.tools.BonsaiGraphTool
import de.unibi.citec.clf.bonsai.gui.model.graph.BonsaiGraphModel
import javafx.scene.control.ScrollPane
import javafx.scene.layout.Border
import javafx.scene.layout.Pane

class BonsaiGraph : ScrollPane() {

    private var contentPane: Pane = Pane()
    var model: BonsaiGraphModel = BonsaiGraphModel()
    var zoomHandler: BonsaiGraphZoomHandler = BonsaiGraphZoomHandler(this)
    private var selectionTool: BonsaiGraphAreaSelectionTool = BonsaiGraphAreaSelectionTool(contentPane, model, zoomHandler)
    var paneMoveTool: BonsaiGraphMovePaneTool = BonsaiGraphMovePaneTool(this)
    private var mouseHandler: BonsaiGraphMouseHandler = BonsaiGraphMouseHandler(this)

    var currentTool: BonsaiGraphTool

    init {
        vbarPolicy = ScrollBarPolicy.AS_NEEDED
        hbarPolicy = ScrollBarPolicy.AS_NEEDED
        isFitToWidth = true
        contentPane.style = "-fx-border-color: green"
        contentPane.minWidthProperty().bind(this.widthProperty())
        contentPane.minHeightProperty().bind(this.heightProperty())
        //contentPane.prefWidth = this.width
        content = contentPane
        mouseHandler.registerHandlerFor(contentPane)
        currentTool = selectionTool
    }

    fun updateEdge(edge: BonsaiEdge, zoomLevel: Double) {
        edge.removeAllNodes(contentPane)
        edge.computeDisplayShape(zoomLevel)
        edge.addAllNodes(contentPane, EDGES_Z_OFFSET)
        mouseHandler.registerNewEdge(edge)
    }

    fun updateEdgeNodesFor(node: BonsaiNode, zoomLevel: Double) {
        for (edge in model.edges) {
            if (edge.source == node || edge.destination == node) {
                updateEdge(edge, zoomLevel)
            }
        }
    }

    fun updateEdgeNodesFor(node: BonsaiNode) {
        updateEdgeNodesFor(node, zoomHandler.currentZoomLevel)
    }

    fun updateSelectionInScene() {
        selectionTool.updateSelectionInScene()
    }

    fun addNode(node: BonsaiNode) {
        node.wrappedNode.translateZ = NODES_Z_OFFSET
        contentPane.children.add(node.wrappedNode)
        model.registerNewNode(node)
        mouseHandler.registerNewNode(node)
    }

    fun addEdge(edge: BonsaiEdge) {
        edge.computeDisplayShape(zoomHandler.currentZoomLevel)
        edge.addAllNodes(contentPane, EDGES_Z_OFFSET)
        model.registerNewEdge(edge)
        mouseHandler.registerNewEdge(edge)
    }


    companion object {
        const val NODES_Z_OFFSET: Double = 10.0
        const val EDGES_Z_OFFSET: Double = 10.0
    }

}