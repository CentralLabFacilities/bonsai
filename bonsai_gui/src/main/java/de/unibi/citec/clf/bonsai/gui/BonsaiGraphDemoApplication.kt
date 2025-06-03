package de.unibi.citec.clf.bonsai.gui
/*
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdge
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiGraph
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiNode
import de.unibi.citec.clf.bonsai.gui.view.utility.BonsaiUtilityBarCreator
import javafx.application.Application
import javafx.event.EventHandler
import javafx.geometry.Pos
import javafx.scene.Scene
import javafx.scene.control.Button
import javafx.scene.control.MenuBar
import javafx.scene.control.ToolBar
import javafx.scene.image.Image
import javafx.scene.layout.HBox
import javafx.scene.layout.Priority
import javafx.scene.layout.VBox
import javafx.stage.Stage
import kotlin.math.cos
import kotlin.math.sin

class BonsaiGraphDemoApplication : Application() {
    override fun start(stage: Stage) {
        stage.minWidth = 800.0
        stage.minHeight = 600.0
        stage.title = this::class.java.simpleName
        stage.icons.add(Image("icons/logo.png"))

        val graph = BonsaiGraph()

        val nodes: MutableList<BonsaiNode> = mutableListOf()
        val edges: MutableList<BonsaiEdge> = mutableListOf()
        val centerX: Int = 400
        val centerY: Int = 300
        val numNodes: Int = 20
        val radius: Int = 220
        for (num in 0..<numNodes) {
            val button1: Button = Button()
            button1.text = "Node $num"
            button1.onAction = EventHandler {
                println("Button clicked!")
            }

            val positionX: Double = centerX + cos(Math.toRadians(360.0 / numNodes * num)) * radius
            val positionY: Double = centerY + sin(Math.toRadians(360.0 / numNodes * num)) * radius

            nodes.add(BonsaiNode(button1, graph, positionX, positionY))
        }
        for (num in 0..<nodes.size - 1) {
            edges.add(BonsaiEdge(graph, nodes[num], nodes[num + 1]))
        }
        val utilityBarCreator = BonsaiUtilityBarCreator()
        val menuBar: MenuBar = utilityBarCreator.createBonsaiMenuBar()
        val toolBar: ToolBar = utilityBarCreator.createBonsaiToolBar()
        val hBox: HBox = HBox(graph, toolBar).apply {
            alignment = Pos.CENTER_RIGHT
        }
        HBox.setHgrow(graph, Priority.ALWAYS)
        val vBox: VBox = VBox(menuBar, hBox)
        VBox.setVgrow(hBox, Priority.ALWAYS)

        stage.setScene(Scene(vBox))

        stage.show()
    }
}

fun main() {
    Application.launch(BonsaiGraphDemoApplication::class.java)
}

 */