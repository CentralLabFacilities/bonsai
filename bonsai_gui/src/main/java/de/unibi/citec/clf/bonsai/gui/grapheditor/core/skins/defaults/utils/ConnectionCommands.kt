package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.ConnectionEventManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.AddCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.Command
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CommandStack
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.RemoveCommand

/**
 * Provides utility methods for adding and removing connections via commands.
 */
object ConnectionCommands {

    /**
     * Adds a connection to the model.
     *
     * @param model
     *          the {@link GModel} to which the connection should be added
     * @param source
     *          the source {@link GConnector} of the new connection
     * @param target
     *          the target {@link GConnector} of the new connection
     * @param type
     *          the type attribute for the new connection
     * @param joints
     *          the list of {@link GJoint} instances to be added inside the new connection
     */
    fun addConnection(model: GModel, source: GConnector, target: GConnector, type: String, joints: List<GJoint>,
                      connectionEventManager: ConnectionEventManager) {
        val command = CompoundCommand()
        val connection = GConnection().apply {
            this.type = type
            this.source = source
            this.target = target
            this.joints.addAll(joints)
        }

        command.apply {
            append(AddCommand.create(model, {model.connections}, connection))
            append(AddCommand.create(source, {source.connections}, connection))
            append(AddCommand.create(target, {target.connections}, connection))
        }

        connectionEventManager.notifyConnectionAdded(connection)?.let {
            command.append(it)
        }

        if (command.canExecute()) {
            CommandStack.getCommandStack(model).execute(command)
        }
    }

    /**
     * Removes a connection from the model.
     *
     * @param model
     *          the {@link GModel} from which the connection should be removed
     * @param connection
     *          the {@link GConnection} to be removed
     * @param connectionEventManager
     */
    fun removeConnection(model: GModel, connection: GConnection, connectionEventManager: ConnectionEventManager) {
        val command = CompoundCommand()

        val source = connection.source
        val target = connection.target

        command.apply {
            append(RemoveCommand.create(model, {model.connections}, connection))
            append(RemoveCommand.create(source, {source.connections}, connection))
            append(RemoveCommand.create(target, {target.connections}, connection))
        }

        connectionEventManager.notifyConnectionRemoved(connection)?.let {
            command.append(it)
        }

        if (command.canExecute()) {
            CommandStack.getCommandStack(model).execute(command)
        }

    }

}