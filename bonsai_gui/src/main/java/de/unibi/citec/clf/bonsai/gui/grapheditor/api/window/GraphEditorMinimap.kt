package de.unibi.citec.clf.bonsai.gui.grapheditor.api.window

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SelectionManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.CommandStackListener
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CommandStack
import javafx.beans.value.ChangeListener
import javafx.geometry.Orientation
import javafx.scene.Node
import java.util.function.Predicate
import kotlin.math.floor

/**
 * A minimap for the graph editor.
 *
 * <p>
 * This extends {@link PanningWindowMinimap}, additionally displaying a small rectangle for each of the nodes in the
 * currently edited model.
 * </p>
 */
class GraphEditorMinimap(): PanningWindowMinimap() {

    companion object {
        private const val INITIAL_ASPECT_RATIO = 0.75
        private const val MINIMAP_WIDTH = 250.0
    }

    private val minimapNodeGroup = MinimapNodeGroup()

    var model: GModel? = null
        /**
         * Sets the model to be displayed in this minimap.
         *
         * @param value
         *          a {@link GModel} to be displayed
         */
        set(value) {
            model?.let { CommandStack.getCommandStack(it).removeCommandStackListener(modelChangeListener) }
            field = value
            minimapNodeGroup.model = model
            minimapNodeGroup.draw()
            field?.let { CommandStack.getCommandStack(it).addCommandStackListener(modelChangeListener) }
        }


    private val modelChangeListener = CommandStackListener { minimapNodeGroup.draw() }

    init {
        contentRepresentation = minimapNodeGroup
    }

    override fun getContentBias(): Orientation {
        return Orientation.HORIZONTAL
    }

    override fun computePrefWidth(height: Double): Double {
        return MINIMAP_WIDTH
    }

    override fun computeMinWidth(height: Double): Double {
        return MINIMAP_WIDTH
    }

    override fun computePrefHeight(width: Double): Double {
        if (width == -1.0) return super.computePrefHeight(width)
        val contentRatio = content?.let {
            it.height / it.width
        } ?: INITIAL_ASPECT_RATIO
        val widthBeforePadding = width - 2 * MINIMAP_PADDING
        val heightBeforePadding = widthBeforePadding * contentRatio
        return floor(heightBeforePadding) + 2 * MINIMAP_PADDING
    }

    override fun computeMinHeight(width: Double): Double {
        return computePrefHeight(width)
    }

    /**
     * Set a filter {@link Predicate} to only draw the desired connections onto the minimap. The default is to show all
     * connections.
     *
     * @param connectionFilter
     *          connection filter {@link Predicate}
     */
    var connectionFilter: Predicate<GConnection>?
        set(value) {
            minimapNodeGroup.connectionFilter = value
        }
        get() = minimapNodeGroup.connectionFilter

    //fun setConnectionFilter(connectionFilter: Predicate<GConnection>) {
    //    minimapNodeGroup.connectionFilter = connectionFilter
    //}

    /**
     * @param minimapRenderer
     *          {@link IMinimapRenderer}
     */
    fun <N: Node> setMinimapRenderer(minimapRenderer: IMinimapRenderer<N>) {
        minimapNodeGroup.minimapRenderer = minimapRenderer
    }

    /**
     * Sets the selection manager instance currently in use by this graph editor.
     *
     * <p>
     * This will be used to show what nodes are currently selected.
     * <p>
     *
     * @param selectionManager
     *          a {@link SelectionManager} instance
     */
    fun setSelectionManager(selectionManager: SelectionManager) {
        minimapNodeGroup.selectionManager = selectionManager
    }
}