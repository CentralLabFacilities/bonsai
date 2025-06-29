package de.unibi.citec.clf.bonsai.gui.grapheditor.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.BonsaiEditorElement
import de.unibi.citec.clf.bonsai.gui.grapheditor.impl.BonsaiGraphEventManagerImpl
import javafx.beans.property.BooleanProperty
import javafx.beans.property.DoubleProperty
import javafx.beans.property.SimpleBooleanProperty
import javafx.beans.property.SimpleDoubleProperty
import javafx.collections.FXCollections
import javafx.collections.ObservableMap
import javafx.event.Event
import java.util.EnumMap

class BonsaiGraphEditorProperties: BonsaiGraphEventManager {

    companion object {
        const val DEFAULT_MAX_WIDTH: Double = Double.MAX_VALUE
        const val DEFAULT_MAX_HEIGHT: Double = Double.MAX_VALUE
        const val DEFAULT_BOUND_VALUE: Double = 15.0
        const val DEFAULT_GRID_SPACING: Double = 12.0
    }

    var northBoundValue: Double = DEFAULT_BOUND_VALUE
    var southBoundValue: Double = DEFAULT_BOUND_VALUE
    var eastBoundValue: Double = DEFAULT_BOUND_VALUE
    var westBoundValue: Double = DEFAULT_BOUND_VALUE

    private val _gridVisible: BooleanProperty = SimpleBooleanProperty(this, "gridVisible")
    var gridVisible: Boolean
        get() = _gridVisible.get()
        set(value) = _gridVisible.set(value)
    fun gridVisibleProperty() = _gridVisible

    private val _snapToGrid: BooleanProperty = SimpleBooleanProperty(this, "snapToGrid")
    var snapToGrid: Boolean
        get() = _snapToGrid.get()
        set(value) = _snapToGrid.set(value)
    fun snapToGridProperty() = _snapToGrid

    private val _gridSpacing: DoubleProperty = SimpleDoubleProperty(this, "gridSpacing", DEFAULT_GRID_SPACING)
    var gridSpacing: Double
        get() = _gridSpacing.get()
        set(value) = _gridSpacing.set(value)
    fun gridSpacingProperty() = _gridSpacing

    private val _readOnly: MutableMap<BonsaiEditorElement, SimpleBooleanProperty> = EnumMap(BonsaiEditorElement::class.java)
    fun isReadOnly(element: BonsaiEditorElement) = _readOnly.getOrPut(element) { SimpleBooleanProperty() }.get()
    fun setReadOnly(element: BonsaiEditorElement, readOnly: Boolean) = _readOnly.getOrPut(element) { SimpleBooleanProperty() }
        .set(readOnly)
    fun readOnlyProperty(type: BonsaiEditorElement) = _readOnly.getOrPut(type, { SimpleBooleanProperty() })

    val customProperties: ObservableMap<String, String> = FXCollections.observableHashMap()

    val eventManager: BonsaiGraphEventManager = BonsaiGraphEventManagerImpl()

    override fun activateGesture(gesture: BonsaiGraphInputGesture, event: Event, owner: Any): Boolean {
        return eventManager.activateGesture(gesture, event, owner)
    }

    override fun finishGesture(expectedGesture: BonsaiGraphInputGesture, owner: Any): Boolean {
        return eventManager.finishGesture(expectedGesture, owner)
    }
}