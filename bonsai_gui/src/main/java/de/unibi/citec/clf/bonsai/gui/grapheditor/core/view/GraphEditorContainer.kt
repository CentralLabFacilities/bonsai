package de.unibi.citec.clf.bonsai.gui.grapheditor.core.view

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.window.AutoScrollingWindow
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.window.GraphEditorMinimap
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import javafx.beans.value.ChangeListener
import javafx.scene.layout.Region

class GraphEditorContainer(): AutoScrollingWindow() {

    companion object {

        private val STYLE_SHEET_VIEW: String? = GraphEditorContainer::class.java.getResource("default.css")?.toExternalForm()

        private const val MINIMAP_INDENT = 10.0

    }

    val minimap: GraphEditorMinimap = GraphEditorMinimap()

    var graphEditor: GraphEditor? = null
        set(value) {
            val previous = field
            previous?._modelProperty?.removeListener(modelChangeListener)
            field = value
            value?.let {
                value._modelProperty.addListener(modelChangeListener)

                val view: Region = value.view
                val model: GModel = value.model
                model.let { view.resize(model.contentWidth, model.contentHeight) }

                content = view
                minimap.content = view
                minimap.model = model
                minimap.setSelectionManager(value.selectionManager)

                view.toBack()

                properties = value.editorProperties
            }
        }

    private val modelChangeListener: ChangeListener<in GModel> = ChangeListener { _, _, newValue -> modelChanged(newValue) }

    init {
        children?.add(minimap)

        minimap.window = this
        minimap.isVisible = true
    }

    override fun getUserAgentStylesheet(): String? {
        return STYLE_SHEET_VIEW
    }

    private fun modelChanged(newValue: GModel) {
        graphEditor?.view?.resize(newValue.contentWidth, newValue.contentHeight)
        checkWindowBounds()
        minimap.model = newValue
    }

    override fun layoutChildren() {
        super.layoutChildren()
        if (children?.contains(minimap) == true) {
            minimap.relocate(width - (minimap.width + MINIMAP_INDENT), MINIMAP_INDENT)
        }
    }
}