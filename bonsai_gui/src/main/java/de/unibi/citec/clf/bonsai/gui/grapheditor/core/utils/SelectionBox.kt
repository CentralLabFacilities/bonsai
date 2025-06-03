package de.unibi.citec.clf.bonsai.gui.grapheditor.core.utils

import javafx.beans.value.ChangeListener
import javafx.scene.Scene
import javafx.scene.shape.Rectangle
import javafx.stage.Window

class SelectionBox: Rectangle() {

    companion object {
        private const val STYLE_CLASS_SELECTION_BOX = "graph-editor-selection-box"
    }

    private lateinit var sceneListener: ChangeListener<Scene>
    private lateinit var windowListener: ChangeListener<Window>
    private lateinit var windowFocusListener: ChangeListener<Boolean>

    init {
        styleClass.addAll(STYLE_CLASS_SELECTION_BOX)

        isVisible = false
        isManaged = false
        isMouseTransparent = true

        addWindowFocusListener()
    }

    fun draw(x: Double, y: Double, width: Double, height: Double) {
        isVisible = true
        this.x = x
        this.y = y
        this.width = width
        this.height = height
    }

    private fun addWindowFocusListener() {
        sceneListener = ChangeListener<Scene> { _, oldValue, newValue ->
            oldValue?.windowProperty()?.removeListener(windowListener)
            newValue?.windowProperty()?.addListener(windowListener)
        }
        windowListener = ChangeListener<Window> { _, oldValue, newValue ->
            oldValue?.focusedProperty()?.removeListener(windowFocusListener)
            newValue?.focusedProperty()?.addListener(windowFocusListener)
        }
        windowFocusListener = ChangeListener<Boolean> { _, _, newValue ->
            if (!newValue) isVisible = false
        }
        sceneProperty().addListener(sceneListener)
    }
}