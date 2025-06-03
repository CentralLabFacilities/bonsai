package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GJointSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.RectangularConnections
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.event.EventHandler
import javafx.scene.input.MouseEvent

class JointAlignmentManager(private val connection: GConnection) {

    private val alignmentHandlers: MutableMap<GJointSkin, EventHandler<MouseEvent>> = mutableMapOf()
    var skinLookup: SkinLookup? = null

    fun addAlignmentHandlers(jointSkins: List<GJointSkin>) {
        val oldAlignmentHandlers: Map<GJointSkin, EventHandler<MouseEvent>> = alignmentHandlers.toMap()
        alignmentHandlers.clear()
        for (jointSkin in jointSkins) {
            val oldHandler: EventHandler<MouseEvent>? = oldAlignmentHandlers[jointSkin]
            oldHandler?.let { jointSkin.root?.removeEventHandler(MouseEvent.MOUSE_PRESSED, oldHandler) }
            val newHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> { _ ->
                addHorizontalAlignmentTargets(jointSkin, jointSkins)
                addVerticalAlignmentTargets(jointSkin, jointSkins)
            }
            jointSkin.root?.addEventHandler(MouseEvent.MOUSE_PRESSED, newHandler)
            alignmentHandlers[jointSkin] = newHandler
        }
    }

    private fun addHorizontalAlignmentTargets(jointSkin: GJointSkin, jointSkins: List<GJointSkin>) {
        val index = jointSkins.indexOf(jointSkin)
        val count = jointSkins.size

        val alignmentValuesX: MutableList<GJointSkin> = mutableListOf()

        if (isPreviousVerticalSegmentStationary(index, jointSkins)) {
           when {
               index == 1 -> alignmentValuesX.add(jointSkins[0])
               index > 1 -> alignmentValuesX.add(jointSkins[index - 2])
           }
        }
        if (isNextVerticalSegmentStationary(index, jointSkins)) {
            when {
                index == count -2 -> alignmentValuesX.add(jointSkins[index + 1])
                index < count - 2 -> alignmentValuesX.add(jointSkins[index + 2])
            }
        }
        if (alignmentValuesX.isNotEmpty()) {
            val alignmentValues: MutableList<Double> = mutableListOf()
            alignmentValuesX.forEach { value -> value.root?.let {alignmentValues.add(it.layoutX) } }
            jointSkin.root?.alignmentTargetsX = alignmentValues
        } else {
            jointSkin.root?.alignmentTargetsX = listOf()
        }
    }

    private fun addVerticalAlignmentTargets(jointSkin: GJointSkin, jointSkins: List<GJointSkin>) {
        val index = jointSkins.indexOf(jointSkin)
        val count = jointSkins.size

        val alignmentValuesY: MutableList<GJointSkin> = mutableListOf()

        if (isPreviousHorizontalSegmentStationary(index, jointSkins)) {
            when {
                index == 1 -> alignmentValuesY.add(jointSkins[0])
                index > 1 -> alignmentValuesY.add(jointSkins[index - 2])
            }
        }
        if (isNextHorizontalSegmentStationary(index, jointSkins)) {
            when {
                index == count -2 -> alignmentValuesY.add(jointSkins[index + 1])
                index < count - 2 -> alignmentValuesY.add(jointSkins[index + 2])
            }
        }
        if (alignmentValuesY.isNotEmpty()) {
            val alignmentValues: MutableList<Double> = mutableListOf()
            alignmentValuesY.forEach { value -> value.root?.let {alignmentValues.add(it.layoutY)} }
            jointSkin.root?.alignmentTargetsY = alignmentValues
        } else {
            jointSkin.root?.alignmentTargetsY = listOf()
        }
    }

    private fun isPreviousVerticalSegmentStationary(index: Int, jointSkins: List<GJointSkin>): Boolean {
        val firstSegmentHorizontal = RectangularConnections.isSegmentHorizontal(connection, 0)
        return if (!firstSegmentHorizontal && (index == 1 || index == 2)) {
            isNodeStationary(jointSkins[index], true)
        } else {
            isJointPairStationary(index, horizontal = false, next = false, jointSkins)
        }
    }

    private fun isNextVerticalSegmentStationary(index: Int, jointSkins: List<GJointSkin>):Boolean {
        val count = jointSkins.size
        val lastSegmentHorizontal = RectangularConnections.isSegmentHorizontal(connection, count)
        return if (!lastSegmentHorizontal && index >= 0 && (index == count - 2 || index == count - 3)) {
            isNodeStationary(jointSkins[index], false)
        } else {
            isJointPairStationary(index, horizontal = false, next = true, jointSkins)
        }
    }

    private fun isPreviousHorizontalSegmentStationary(index: Int, jointSkins: List<GJointSkin>): Boolean {
        val firstSegmentHorizontal = RectangularConnections.isSegmentHorizontal(connection, 0)
        return if (firstSegmentHorizontal && (index == 1 || index == 2)) {
            isNodeStationary(jointSkins[index], true)
        } else {
            isJointPairStationary(index, horizontal = true, next = false, jointSkins)
        }
    }

    private fun isNextHorizontalSegmentStationary(index: Int, jointSkins: List<GJointSkin>): Boolean {
        val count = jointSkins.size
        val lastSegmentHorizontal = RectangularConnections.isSegmentHorizontal(connection, count)
        return if (lastSegmentHorizontal && index >= 0 && (index == count - 2 || index == count - 3)) {
            isNodeStationary(jointSkins[index], false)
        } else {
            isJointPairStationary(index, horizontal = true, next = true, jointSkins)
        }
    }

    private fun isNodeStationary(jointSkin: GJointSkin, source: Boolean): Boolean {
        val connector : GConnector? = if (source) connection.source else connection.target
        val parent = connector?.parent
        val nodeSkin = parent?.let { skinLookup?.lookupNode(it) }
        return !(nodeSkin?.selected ?: true) || !jointSkin.selected
    }

    private fun isJointPairStationary(index: Int, horizontal: Boolean, next: Boolean, jointSkins: List<GJointSkin>): Boolean {
        val segmentHorizontal = RectangularConnections.isSegmentHorizontal(connection, index + 1)
        val jump = if (segmentHorizontal == (horizontal == next)) 2 else 1
        val firstIndex = if (next) index + jump else index - jump
        val secondIndex = if (next) index + jump + 1 else index - jump - 1
        return if (secondIndex >= 0 && secondIndex < jointSkins.size) {
            val firstNotSelected = !jointSkins[firstIndex].selected
            val secondNotSelected = !jointSkins[secondIndex].selected
            val draggedNotSelected = !jointSkins[index].selected

            firstNotSelected && secondNotSelected || draggedNotSelected
        } else {
            false
        }
    }
}