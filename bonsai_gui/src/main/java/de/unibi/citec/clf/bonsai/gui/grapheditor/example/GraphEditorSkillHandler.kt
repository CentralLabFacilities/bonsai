package de.unibi.citec.clf.bonsai.gui.grapheditor.example

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.State
import javafx.event.EventHandler
import javafx.geometry.Insets
import javafx.scene.control.Button
import javafx.scene.control.Label
import javafx.scene.layout.VBox
import javafx.scene.paint.Color
import javafx.scene.shape.Circle
import javafx.stage.Popup
import javafx.stage.Stage
import javafx.stage.Window

class GraphEditorSkillHandler {

    fun selectNewState(graphEditor: GraphEditor): State? {
        return null
    }

    fun showSelectionPopUp(window: Window): State? {
        val popup = Popup().apply {
            val label = Label("Select skill")
            val hide = Button("Hide")
            hide.onAction = EventHandler { this.hide() }
            val vBox = VBox().apply {
                spacing = 5.0
                padding = Insets(10.0, 0.0, 0.0, 10.0)
                children.addAll(label, hide)
                style = "-fx-background-color: cornsilk; -fx-padding: 10;"
            }
            content.addAll(vBox)
        }
        popup.show(window)
        return State()
    }
}