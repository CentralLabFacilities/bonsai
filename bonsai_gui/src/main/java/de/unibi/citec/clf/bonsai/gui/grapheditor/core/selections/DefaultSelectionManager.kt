package de.unibi.citec.clf.bonsai.gui.grapheditor.core.selections

import com.sun.javafx.scene.GroupHelper
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SelectionManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorView
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import javafx.collections.FXCollections
import javafx.collections.ObservableSet

/**
 * Manages all graph editor logic relating to selections of one or more nodes
 * and/or joints.
 *
 * <p>
 * Delegates certain jobs to the following classes.
 *
 * <ol>
 * <li>SelectionCreator - creates selections of objects via clicking or dragging
 * <li>SelectionDragManager - ensures selected objects move together when one is
 * dragged
 * <li>SelectionTracker - keeps track of the current selection
 * </ol>
 *
 * </p>
 */
class DefaultSelectionManager(skinLookup: SkinLookup, view: GraphEditorView) : SelectionManager {

    private val selectionCreator: SelectionCreator
    private val selectionTracker: SelectionTracker

    private var model: GModel? = null

    init {
        val selectionDragManager = SelectionDragManager(skinLookup, view, this)
        selectionCreator = SelectionCreator(skinLookup, view, this, selectionDragManager)
        selectionTracker = SelectionTracker(skinLookup)
    }

    fun initialize(model: GModel) {
        this.model = model
        selectionCreator.initialize(model)
        selectionTracker.initialize()
    }

    fun addNode(node: GNode) {
        selectionCreator.addNode(node)
    }

    fun removeNode(node: GNode) {
        selectionCreator.removeNode(node)
    }

    fun addConnector(connector: GConnector) {
        selectionCreator.addConnector(connector)
    }

    fun removeConnector(connector: GConnector) {
        selectionCreator.removeConnector(connector)
    }

    fun addConnection(connection: GConnection) {
        selectionCreator.addConnection(connection)
    }

    fun removeConnection(connection: GConnection) {
        selectionCreator.removeConnection(connection)
    }

    fun addJoint(joint: GJoint) {
        selectionCreator.addJoint(joint)
    }

    fun removeJoint(joint: GJoint) {
        selectionCreator.removeJoint(joint)
    }

    override val selectedConnections: List<GConnection>
        get() = selectionTracker.selectedConnections

    override val selectedItems: ObservableSet<Selectable>
        get() = selectionTracker.selectedItems

    override val selectedJoints: List<GJoint>
        get() = selectionTracker.selectedJoints

    override val selectedNodes: List<GNode>
        get() = selectionTracker.selectedNodes

    /**
    override fun getSelectedConnections(): List<GConnection> {
        return selectionTracker.selectedConnections
    }

    override fun getSelectedItems(): ObservableSet<Selectable> {
        return selectionTracker.selectedItems
    }

    override fun getSelectedJoints(): List<GJoint> {
        return selectionTracker.selectedJoints
    }

    override fun getSelectedNodes(): List<GNode> {
        return selectionTracker.selectedNodes
    }
    **/

    override fun <S: Selectable>select(obj: S) {
        selectionTracker.selectedItems.add(obj)
    }

    override fun <S: Selectable>clearSelection(obj: S) {
        selectionTracker.selectedItems.remove(obj)
    }

    override fun isSelected(obj: Selectable): Boolean {
        return selectedItems.contains(obj)
    }

    override fun clearSelection() {
        if (!selectedItems.isEmpty()) {
            selectedItems.clear()
        }
    }

    override fun selectAll() {
        model?.let {
            selectedItems.addAll(it.nodes)
            for (connection in it.connections) {
                selectedItems.add(connection)
                for (joint in connection!!.joints) {
                    selectedItems.add(joint)
                }
            }
        }
    }


}