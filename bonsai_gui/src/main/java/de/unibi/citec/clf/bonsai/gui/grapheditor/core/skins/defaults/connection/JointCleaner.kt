package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GJointSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.utils.EventUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import javafx.event.EventHandler
import javafx.geometry.Point2D
import javafx.scene.input.MouseButton
import javafx.scene.input.MouseEvent
import javafx.scene.layout.Region
import java.util.BitSet

class JointCleaner(private val connection: GConnection) {

    private val cleaningHandlers: MutableMap<Region, EventHandler<MouseEvent>> = mutableMapOf()
    var graphEditor: GraphEditor? = null

    fun addCleaningHandlers(jointSkins: List<GJointSkin>) {
        EventUtils.removeEventHandlers(cleaningHandlers, MouseEvent.MOUSE_RELEASED)
        for (jointSkin in jointSkins) {
            val jointRegion = jointSkin.root
            val newHandler = EventHandler<MouseEvent> { event ->
                val parent = jointRegion?.parent
                if (jointSkins.size == 2 || event.button != MouseButton.PRIMARY) return@EventHandler
                val jointPositions: List<Point2D> = GeometryUtils.getJointPositions(jointSkins)
                val jointsToCleanUp: BitSet = findJointsToCleanUp(jointPositions)
                if (!jointsToCleanUp.isEmpty) {
                    val command = CompoundCommand()

                    val model = graphEditor?.model
                    val skinLookup = graphEditor?.skinLookup

                    JointCommands.removeJoints(command, jointsToCleanUp, connection)
                    model?.let { model ->
                        skinLookup?.let { skinLookup ->
                            Commands.updateLayoutValues(command, model, skinLookup)
                        }
                    }

                }
                parent?.layout()
            }
            jointRegion?.addEventHandler(MouseEvent.MOUSE_RELEASED, newHandler)
            jointRegion?.let {cleaningHandlers[it] = newHandler}
        }
    }

    companion object {

        fun findJointsToCleanUp(jointPositions: List<Point2D>): BitSet {
            val jointsToCleanup = BitSet(jointPositions.size)
            val remainingJointPositions: MutableList<Point2D> = jointPositions.toMutableList()
            var removed: Point2D? = removeJointPair(remainingJointPositions)
            while (removed != null) {
                var jointsCleaned = 0
                for (joint in jointPositions.withIndex()) {
                    val positionMatch = removed == joint.value
                    val alreadyCounted = jointsToCleanup.get(joint.index)
                    if (positionMatch && !alreadyCounted) {
                        jointsToCleanup.set(joint.index)
                        jointsCleaned++
                    }
                    if (jointsCleaned == 2) break
                }
                removed = removeJointPair(remainingJointPositions)
            }
            return jointsToCleanup
        }

        private fun removeJointPair(jointPositions: MutableList<Point2D>): Point2D? {
            var foundIndex = -1
            var foundPosition: Point2D? = null
            if (jointPositions.size > 2) {
                for (currentJointPosition in jointPositions.dropLast(1).withIndex()) {
                    val nextJointPosition = jointPositions[currentJointPosition.index + 1]
                    if (currentJointPosition.value.x == nextJointPosition.x && currentJointPosition.value.y == nextJointPosition.y) {
                        foundIndex = currentJointPosition.index
                        foundPosition = currentJointPosition.value
                    }
                }
            }
            if (foundIndex >= 0) {
                jointPositions.removeAt(foundIndex + 1)
                jointPositions.removeAt(foundIndex)
            }
            return foundPosition
        }
    }
}