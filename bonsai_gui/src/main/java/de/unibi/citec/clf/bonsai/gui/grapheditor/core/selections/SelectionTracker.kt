package de.unibi.citec.clf.bonsai.gui.grapheditor.core.selections

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.*
import javafx.collections.FXCollections
import javafx.collections.ObservableSet
import javafx.collections.SetChangeListener

class SelectionTracker(private val skinLookup: SkinLookup) {

    private val selectedElements: ObservableSet<Selectable> = FXCollections.observableSet(HashSet())

    init {
        selectedElements.addListener(this::selectedElementsChanged)
    }

    private fun selectedElementsChanged(change: SetChangeListener.Change<out Selectable>) {
        if (change.wasRemoved()) {
            update(change.elementRemoved)
        }
        if (change.wasAdded()) {
            update(change.elementAdded)
        }
    }

    private fun update(obj: Selectable) {
        when(obj) {
            is GNode -> skinLookup.lookupNode(obj)
            is GJoint -> skinLookup.lookupJoint(obj)
            is GConnection -> skinLookup.lookupConnection(obj)
            is GConnector -> skinLookup.lookupConnector(obj)
            else -> null
        }.let {
            it?.updateSelection()
        }
    }

    fun initialize() {
        selectedElements.clear()
    }

    val selectedNodes: List<GNode>
        get() = selectedElements.filterIsInstance<GNode>()
        //private set(value) {}

    val selectedConnections: List<GConnection>
        get() = selectedElements.filterIsInstance<GConnection>()
        //private set(value) {}

    val selectedJoints: List<GJoint>
        get() = selectedElements.filterIsInstance<GJoint>()
        //private set(value) {}

    val selectedItems: ObservableSet<Selectable>
        get() = selectedElements
        //private set(value) {}

    /**
    fun getSelectedNodes(): List<GNode> {
        return selectedElements.filterIsInstance<GNode>()
    }

    fun getSelectedConnections(): List<GConnection> {
        return selectedElements.filterIsInstance<GConnection>()
    }

    fun getSelectedJoints(): List<GJoint> {
        return selectedElements.filterIsInstance<GJoint>()
    }

    fun getSelectedItems(): ObservableSet<Selectable> {
        return selectedElements
    }
    **/

}