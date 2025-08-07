package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.DraggableBox
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import javafx.beans.property.BooleanPropertyBase
import javafx.scene.Node
import java.util.function.Consumer

abstract class GSkin<T: Selectable>(val item: T?) {

    abstract val root: Node?

    private val _selectedProperty = object : BooleanPropertyBase(false) {
        override fun getBean(): Any {
            return this
        }

        override fun getName(): String {
            return "selected"
        }

        override fun invalidated() {
            selectionChanged(get())
        }
    }
    var selected: Boolean
        get() = _selectedProperty.get()
        set(value) = _selectedProperty.set(value)
    fun selectedProperty() = _selectedProperty

    open var graphEditor: GraphEditor? = null
        set(value) {
            field = value
            updateSelection()
        }
    private var onPositionMoved: Consumer<GSkin<T>>? = null

    /**
     * Updates whether this skin is in a selected state or not.
     * <p>
     * This method will be automatically called by the SelectionTracker when
     * needed.
     * </p>
     */
    fun updateSelection() {
        selected = item?.let {
            graphEditor?.selectionManager?.isSelected(it) ?: false
        } ?: false
    }

    /**
     * Is called whenever the selection state has changed.
     *
     * @param isSelected
     *            {@code true} if the skin is selected, {@code false} if not
     */
    protected abstract fun selectionChanged(isSelected: Boolean)

    /**
     * Called after the skin is removed. Can be overridden for cleanup.
     */
    open fun dispose() {
        val root: Node? = root
        if (root is DraggableBox) {
            val rootNode = root
            rootNode.dispose()
        }
        onPositionMoved = null
        graphEditor = null
    }

    /**
     * <p>
     * INTERNAL API
     * </p>
     *
     * @param pOnPositionMoved
     *            internal update hook to be informed when the position has been
     *            changed
     */
    fun impl_setOnPositionMoved(pOnPositionMoved: Consumer<GSkin<T>>) {
        onPositionMoved = pOnPositionMoved
    }

    /**
     * <p>
     * INTERNAL API
     * </p>
     * will be called when the position of this skin has been moved
     */
    fun impl_positionMoved() {
        val inform: Consumer<GSkin<T>>? = onPositionMoved
        inform?.accept(this)
    }



}