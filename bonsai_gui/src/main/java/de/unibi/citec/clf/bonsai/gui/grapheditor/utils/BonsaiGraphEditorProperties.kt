package de.unibi.citec.clf.bonsai.gui.grapheditor.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.BonsaiEditorElement
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

        var northBoundValue: Double = DEFAULT_BOUND_VALUE
        var southBoundValue: Double = DEFAULT_BOUND_VALUE
        var eastBoundValue: Double = DEFAULT_BOUND_VALUE
        var westBoundValue: Double = DEFAULT_BOUND_VALUE

        val gridVisible: BooleanProperty = SimpleBooleanProperty(this, "gridVisible")
        val snapToGrid: BooleanProperty = SimpleBooleanProperty(this, "snapToGrid")
        val gridSpacing: DoubleProperty = SimpleDoubleProperty(this, "gridSpacing", DEFAULT_GRID_SPACING)

        val readOnly: Map<BonsaiEditorElement, BooleanProperty> = EnumMap(BonsaiEditorElement::class.java)

        val customProperties: ObservableMap<String, String> = FXCollections.observableHashMap()

        val eventManager: BonsaiGraphEventManager = GraphEventManagerImpl()
    }

    override fun activateGesture(gesture: BonsaiGraphInputGesture, event: Event, owner: Any): Boolean {
        return eventManager.activateGesture(gesture, event, owner)
    }

    override fun finishGesture(expectedGesture: BonsaiGraphInputGesture, owner: Any): Boolean {
        return eventManager.finishGesture(expectedGesture, owner)
    }
}