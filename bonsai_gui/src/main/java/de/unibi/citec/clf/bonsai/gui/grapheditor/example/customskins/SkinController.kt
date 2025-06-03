package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins

import de.unibi.citec.clf.bonsai.gui.grapheditor.example.selections.SelectionCopier
import javafx.geometry.Side

/**
 * Responsible for skin-specific logic in the graph editor demo.
 */
interface SkinController {
    /**
     * Adds a node to the graph.
     *
     * @param currentZoomFactor the current zoom factor (1 for 100%)
     */
    fun addNode(currentZoomFactor: Double)

    /**
     * activates this skin
     */
    fun activate()

    /**
     * Adds a connector of the given type to all selected nodes.
     *
     * @param position the currently selected connector position
     * @param input `true` for input, `false` for output
     */
    fun addConnector(position: Side?, input: Boolean)

    /**
     * Clears all connectors from all selected nodes.
     */
    fun clearConnectors()

    /**
     * Handles the paste operation.
     * @param selectionCopier [SelectionCopier]
     */
    fun handlePaste(selectionCopier: SelectionCopier?)

    /**
     * Handles the select-all operation.
     */
    fun handleSelectAll()
}