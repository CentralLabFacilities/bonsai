package de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.EditorElement
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.impl.GraphEventManagerImpl
import javafx.beans.property.BooleanProperty
import javafx.beans.property.DoubleProperty
import javafx.beans.property.SimpleBooleanProperty
import javafx.beans.property.SimpleDoubleProperty
import javafx.collections.FXCollections
import javafx.collections.ObservableMap
import javafx.event.Event
import java.util.EnumMap


/**
 * General properties for the graph editor.
 *
 * <p>
 * For example, should the editor have 'bounds', or should objects be draggable outside the editor area?
 * </p>
 *
 * <p>
 * If a bound is <b>active</b>, objects that are dragged or resized in the editor should stop when they hit the edge,
 * and the editor region will not try to grow in size. Otherwise it will grow up to its max size.
 * </p>
 *
 * <p>
 * Also stores properties for whether the grid is visible and/or snap-to-grid is on.
 * </p>
 */
class GraphEditorProperties(): GraphEventManager {

    companion object {

        /**
         * The default max width of the editor region, set on startup.
         */
        const val DEFAULT_MAX_WIDTH: Double = Double.MAX_VALUE

        /**
         * The default max height of the editor region, set on startup.
         */
        const val DEFAULT_MAX_HEIGHT: Double = Double.MAX_VALUE
        const val DEFAULT_BOUND_VALUE: Double = 15.0
        const val DEFAULT_GRID_SPACING: Double = 12.0
    }

    // The distance from the editor edge at which the objects should stop when dragged / resized.
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

    private val _readOnly: MutableMap<EditorElement, SimpleBooleanProperty> = EnumMap(EditorElement::class.java)


    constructor(editorProperties: GraphEditorProperties) : this() {
        northBoundValue = editorProperties.northBoundValue
        southBoundValue = editorProperties.southBoundValue
        eastBoundValue = editorProperties.eastBoundValue
        westBoundValue = editorProperties.westBoundValue

        gridVisible = editorProperties.gridVisible
        snapToGrid = editorProperties.snapToGrid
        gridSpacing = editorProperties.gridSpacing

        for ((key, value) in editorProperties._readOnly) {
            _readOnly.computeIfAbsent(key) { SimpleBooleanProperty() }.set(value.get())
        }

        customProperties.putAll(editorProperties.customProperties)
    }

    /**
     * Returns whether or not the graph is in read only state.
     *
     * @param element
     *         {@link EditorElement}
     * @return whether or not the graph is in read only state.
     */
    fun isReadOnly(element: EditorElement) = _readOnly.getOrPut(element) { SimpleBooleanProperty() }.get()

    /**
     * @param element
     *         {@link EditorElement}
     * @param readOnly
     *         {@code true} to set the graph editor in read only state or {@code false} (default) for edit state.
     */
    fun setReadOnly(element: EditorElement, readOnly: Boolean) = _readOnly.getOrPut(element) { SimpleBooleanProperty() }
        .set(readOnly)
    fun readOnlyProperty(type: EditorElement) = _readOnly.getOrPut(type, { SimpleBooleanProperty() })

    /**
     * Additional properties that may be added and referred to in custom skin implementations.
     */
    val customProperties: ObservableMap<String, String> = FXCollections.observableHashMap()

    val eventManager: GraphEventManager = GraphEventManagerImpl()

    override fun activateGesture(gesture: GraphInputGesture, event: Event, owner: Any): Boolean {

        return eventManager.activateGesture(gesture, event, owner)
    }

    override fun finishGesture(expectedGesture: GraphInputGesture, owner: Any): Boolean {
        return eventManager.finishGesture(expectedGesture, owner)
    }
}