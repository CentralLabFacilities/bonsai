package de.unibi.citec.clf.bonsai.gui.grapheditor.core.selections

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SelectionManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.DraggableBox
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorView
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.beans.value.ChangeListener
import javafx.event.EventHandler
import javafx.scene.input.MouseEvent
import kotlin.math.max

class SelectionDragManager(private val skinLookup: SkinLookup, val view: GraphEditorView, private val selectionManager: SelectionManager) {

    private val layoutXListener = ChangeListener<Number> { _, _, newValue -> masterMovedX(newValue.toDouble())}
    private val layoutYListener = ChangeListener<Number> { _, _, newValue -> masterMovedY(newValue.toDouble())}

    private val currentSelectedElements: MutableList<DraggableBox> = ArrayList()
    private var elementLayoutXOffsets: DoubleArray = DoubleArray(0)
    private var elementLayoutYOffsets: DoubleArray = DoubleArray(0)

    private var master: DraggableBox? = null
    private var removeOnReleased: EventHandler<MouseEvent>? = null

    private fun masterMovedX(x: Double) {
        master?.let {
            for (element in currentSelectedElements.withIndex()) {
                if (element.value != master) {
                    element.value.layoutX = x + elementLayoutXOffsets[element.index]
                    element.value.positionMoved()
                    println("Moved!")
                }
            }
        }
    }

    private fun masterMovedY(y: Double) {
        master?.let {
            for (element in currentSelectedElements.withIndex()) {
                if (element.value != master) {
                    element.value.layoutY = y + elementLayoutYOffsets[element.index]
                    element.value.positionMoved()
                }
            }
        }
    }

    fun bindPositions(master: DraggableBox) {
        currentSelectedElements.clear()
        this.master?.let { removePositionListeners(it) }
        for (selected in selectionManager.selectedItems) {
            if (selected is GNode) {
                skinLookup.lookupNode(selected)?.root?.let {
                    currentSelectedElements.add(it)
                }
            } else if (selected is GJoint) {
                skinLookup.lookupJoint(selected)?.root?.let {
                    currentSelectedElements.add(it)
                }
            }
        }
        if (currentSelectedElements.isEmpty() || currentSelectedElements.size == 1 && currentSelectedElements[0] == master) return
        this.master = master
        storeCurrentOffsets(master)
        setEditorBoundsForDrag(master)
        addPositionListeners(master)
    }

    private fun unbindPositions(master: DraggableBox) {
        removePositionListeners(master)
        restoreEditorProperties(master)
        currentSelectedElements.clear()
        elementLayoutXOffsets = DoubleArray(0)
        elementLayoutYOffsets = DoubleArray(0)
        this.master = null
    }

    private fun storeCurrentOffsets(master: DraggableBox) {
        elementLayoutYOffsets = DoubleArray(currentSelectedElements.size)
        elementLayoutXOffsets = DoubleArray(currentSelectedElements.size)
        for (element in currentSelectedElements.withIndex()) {
            if (element.value != master) {
                elementLayoutXOffsets[element.index] = element.value.layoutX - master.layoutX
                elementLayoutYOffsets[element.index] = element.value.layoutY - master.layoutY
            }
        }
    }

    private fun setEditorBoundsForDrag(master: DraggableBox) {
        val propertiesForDrag = GraphEditorProperties(view.editorProperties)
        val maxOffsets = BoundOffsets()
        for (node in currentSelectedElements) {
            addOffsets(master, node, maxOffsets)
        }
        propertiesForDrag.northBoundValue += maxOffsets.northOffset
        propertiesForDrag.southBoundValue += maxOffsets.southOffset
        propertiesForDrag.eastBoundValue += maxOffsets.eastOffset
        propertiesForDrag.westBoundValue += maxOffsets.westOffset
        master.editorProperties = propertiesForDrag
    }

    private fun addOffsets(master: DraggableBox, slave: DraggableBox, maxOffsets: BoundOffsets) {
        val westOffset = master.layoutX - slave.layoutX
        val eastOffset = slave.layoutX + slave.width - (master.layoutX + master.width)
        maxOffsets.westOffset = max(maxOffsets.westOffset, westOffset)
        maxOffsets.eastOffset = max(maxOffsets.eastOffset, eastOffset)
        val northOffset = master.layoutY - slave.layoutY
        val southOffset = slave.layoutY + slave.height - (master.layoutY + master.height)
        maxOffsets.northOffset = max(maxOffsets.northOffset, northOffset)
        maxOffsets.southOffset = max(maxOffsets.southOffset, southOffset)
    }

    private fun restoreEditorProperties(master: DraggableBox) {
        master.editorProperties = view.editorProperties
    }

    private fun addPositionListeners(master: DraggableBox) {
        master.layoutXProperty().addListener(layoutXListener)
        master.layoutYProperty().addListener(layoutYListener)
        removeOnReleased = object : EventHandler<MouseEvent> {
            override fun handle(event: MouseEvent?) {
                unbindPositions(master)
                master.removeEventHandler(MouseEvent.MOUSE_RELEASED, this)
            }
        }
        master.addEventHandler(MouseEvent.MOUSE_RELEASED, removeOnReleased)
    }

    private fun removePositionListeners(master: DraggableBox) {
        master.layoutXProperty().removeListener(layoutXListener)
        master.layoutYProperty().removeListener(layoutYListener)
        removeOnReleased?.let {
            master.removeEventHandler(MouseEvent.MOUSE_RELEASED, it)
        }
        removeOnReleased = null
    }

    private class BoundOffsets {
        var northOffset: Double = 0.0
        var southOffset: Double = 0.0
        var eastOffset: Double = 0.0
        var westOffset: Double = 0.0
    }

}