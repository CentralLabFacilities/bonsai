package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.AddCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CommandStack
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.RemoveCommand
import javafx.geometry.Point2D
import java.util.*

object JointCommands {

    /**
     * Removes any existing joints from the connection and creates a new set of joints at the given positions.
     *
     * <p>
     * This is executed as a single compound command and is therefore a single element in the undo-redo stack.
     * </p>
     *
     * @param positions
     *          a list of {@link Point2D} instances specifying the x and y positions of the new joints
     * @param connection
     *          the connection in which the joints will be set
     */
    fun setNewJoints(model: GModel?, positions: List<Point2D>, connection: GConnection) {
        val command = CompoundCommand()

        val existingJoints = connection.joints
        for (joint in existingJoints) {
            command.append(RemoveCommand.create(connection, { connection.joints }, joint))
        }

        for (position in positions) {
            val newJoint: GJoint = GJoint()
            newJoint.x = position.x
            newJoint.y = position.y

            command.append(AddCommand.create(connection, { connection.joints }, newJoint))
        }

        if (command.canExecute() && model != null) {
            CommandStack.getCommandStack(model).execute(command)
        }
    }

    /**
     * Removes joints from a connection.
     *
     * <p>
     * This method adds the remove operations to the given compound command and does not execute it.
     * </p>
     *
     * @param command
     *          a {@link CompoundCommand} to which the remove commands will be added
     * @param indices
     *          the indices within the connection's list of joints specifying the joints to be removed
     * @param connection
     *          the connection whose joints are to be removed
     */
    fun removeJoints(command: CompoundCommand, indices: BitSet, connection: GConnection) {
        for (joint in connection.joints.withIndex()) {
            if (indices.get(joint.index)) {
                val jointToRemove = connection.joints[joint.index]
                command.append(RemoveCommand.create(connection, { connection.joints }, jointToRemove))
            }
        }
    }

}