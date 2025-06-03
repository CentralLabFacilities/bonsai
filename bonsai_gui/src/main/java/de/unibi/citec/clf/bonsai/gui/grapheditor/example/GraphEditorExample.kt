package de.unibi.citec.clf.bonsai.gui.grapheditor.example

import javafx.application.Application
import javafx.fxml.FXMLLoader
import javafx.scene.Parent
import javafx.scene.Scene
import javafx.scene.text.Font
import javafx.stage.Stage

/**
 * A demo application to show uses of the [GraphEditor] library.
 */
class GraphEditorDemo : Application() {
    @Throws(Exception::class)
    override fun start(stage: Stage) {
        val location = javaClass.getResource("/GraphEditorDemo.fxml")
        val loader = FXMLLoader()
        val root = loader.load<Parent>(location.openStream())
        val scene = Scene(root, 830.0, 630.0)
        scene.stylesheets.add(javaClass.getResource(DEFAULT_STYLESHEET).toExternalForm())
        scene.stylesheets.add(javaClass.getResource(DEMO_STYLESHEET).toExternalForm())
        scene.stylesheets.add(javaClass.getResource(TREE_SKIN_STYLESHEET).toExternalForm())
        scene.stylesheets.add(javaClass.getResource(TITLED_SKIN_STYLESHEET).toExternalForm())
        Font.loadFont(javaClass.getResource(FONT_AWESOME).toExternalForm(), 12.0)
        stage.scene = scene
        stage.title = APPLICATION_TITLE
        stage.show()
        val controller: GraphEditorDemoController = loader.getController()
        controller.panToCenter()
    }

    companion object {
        private const val APPLICATION_TITLE = "Graph Editor Demo" //$NON-NLS-1$
        private const val DEMO_STYLESHEET = "/demo.css" //$NON-NLS-1$
        private const val TREE_SKIN_STYLESHEET = "/treeskins.css" //$NON-NLS-1$
        private const val TITLED_SKIN_STYLESHEET = "/titledskins.css" //$NON-NLS-1$
        private const val FONT_AWESOME = "/fontawesome.ttf" //$NON-NLS-1$
        private const val DEFAULT_STYLESHEET = "/defaults.css"
    }
}

fun main() {
    Application.launch(GraphEditorDemo::class.java)
}