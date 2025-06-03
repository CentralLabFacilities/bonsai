package de.unibi.citec.clf.bonsai.gui

import de.unibi.citec.clf.bonsai.gui.view.graph.core.BonsaiGraph
import de.unibi.citec.clf.bonsai.gui.view.graph.core.BonsaiGraphBuilder
import de.unibi.citec.clf.bonsai.gui.view.graph.edge.BonsaiEdgeBuilder
import de.unibi.citec.clf.bonsai.gui.view.graph.node.BonsaiNode
import de.unibi.citec.clf.bonsai.gui.view.graph.node.BonsaiNodeBuilder
import javafx.application.Application
import javafx.event.EventHandler
import javafx.scene.Scene
import javafx.scene.control.Button
import javafx.stage.Stage
import kotlin.math.cos
import kotlin.math.sin

class BonsaiGraphDemoApplication : Application() {
    override fun start(stage: Stage) {
        stage.minWidth = 800.0
        stage.minHeight = 600.0
        stage.title = this::class.java.simpleName

        val graphBuilder: BonsaiGraphBuilder = BonsaiGraphBuilder.create()
        val graph: BonsaiGraph = graphBuilder.build()

        val nodes: MutableList<BonsaiNode> = mutableListOf()
        val centerX: Int = 400
        val centerY: Int = 300
        val numNodes: Int = 20
        val radius: Int = 220
        for (num in 0..< numNodes) {
            val button1: Button = Button()
            button1.text = "Node $num"
            button1.onAction = EventHandler {
                println("Button clicked!")
            }

            val positionX: Double = centerX + cos(Math.toRadians(360.0 / numNodes * num)) * radius
            val positionY: Double = centerY + sin(Math.toRadians(360.0 / numNodes * num)) * radius

            val nodeBuilder: BonsaiNodeBuilder = BonsaiNodeBuilder(graph)
            nodes.add(nodeBuilder.node(button1).x(positionX).y(positionY).build())
        }
        for (num in 0..< nodes.size - 1) {
            val edgeBuilder: BonsaiEdgeBuilder = BonsaiEdgeBuilder(graph)
            edgeBuilder.source(nodes[num]).destination(nodes[num+1]).build()
        }

        stage.setScene(Scene(graph))

        stage.show()
    }
}

fun main() {
    Application.launch(BonsaiGraphDemoApplication::class.java)
}