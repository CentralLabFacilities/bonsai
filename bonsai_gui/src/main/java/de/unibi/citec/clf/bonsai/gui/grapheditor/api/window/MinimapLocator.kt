package de.unibi.citec.clf.bonsai.gui.grapheditor.api.window

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.DraggableBox

/**
 * The minimap-representation of the currently-visible region of the graph
 * editor.
 *
 * <p>
 * This looks like a rectangle in the minimap. It's position 'locates' the
 * currently-visible region relative to the entire content.
 * </p>
 */
class MinimapLocator(val minimapPadding: Double) : DraggableBox(null) {

    companion object {
        private const val STYLE_CLASS_LOCATOR: String = "minimap-locator"
    }

    init {
        styleClass.add(STYLE_CLASS_LOCATOR)

        val locatorProperties = GraphEditorProperties()

        locatorProperties.northBoundValue = minimapPadding
        locatorProperties.southBoundValue = minimapPadding
        locatorProperties.eastBoundValue = minimapPadding
        locatorProperties.westBoundValue = minimapPadding

        editorProperties = locatorProperties
    }

    override fun isEditable(): Boolean {
        return true
    }

}