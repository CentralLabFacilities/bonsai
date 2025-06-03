package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import javafx.collections.ObservableSet

interface SelectionManager {

    /**
     * Gets the list of currently selected nodes.
     *
     * <p>
     * This list is read-only. Nodes should be selected via {@link #select(Selectable)}.
     * </p>
     */
    val selectedNodes: List<GNode>

    /**
     * Gets the list of currently selected connections.
     *
     * <p>
     * This list is read-only. Connections should be selected via {@link #select(Selectable)}.
     * </p>
     */
    val selectedConnections: List<GConnection>

    /**
     * Gets the list of currently selected joints.
     *
     * <p>
     * This list is read-only. Joints should be selected via {@link #select(Selectable)}.
     * </p>
     */
    val selectedJoints: List<GJoint>

    /**
     * Gets the {@link ObservableSet} of currently-selected items.
     *
     * <p>
     * This set is read-only. Items should be selected via {@link #select(Selectable)}.
     * </p>
     */
    val selectedItems: ObservableSet<Selectable>

    /**
     * Convenience method to inform if the given object is currently selected. Is
     * functionally equivalent to calling
     * <code>getSelectedItems().contains(object)</code>.
     *
     * @param obj
     * @return {@code true} if the given index is selected, {@code false} otherwise.
     */
    fun isSelected(obj: Selectable): Boolean

    /**
     * This method will attempt to select the given object.
     *
     * @param obj The object to attempt to select in the underlying data model.
     */
    fun <S: Selectable>select(obj: S)

    /**
     * Selects all selectable elements (nodes, joints, and connections) in the graph editor.
     */
    fun selectAll()

    /**
     * This method will clear the selection of the given object.
     * If the given object is not selected, nothing will happen.
     *
     * @param obj The selected item to deselect.
     */
    fun <S: Selectable>clearSelection(obj: S)

    /**
     * Clears the selection, i.e. de-selects all elements.
     */
    fun clearSelection()

}