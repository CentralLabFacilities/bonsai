package de.unibi.citec.clf.bonsai.gui.grapheditor.core.model

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.RemoveContext
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.ModelEditingManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.Command
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CommandStack
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.RemoveCommand
import java.util.function.BiFunction

class DefaultModelEditingManager() : ModelEditingManager {

    private var model: GModel? = null
    private var onConnectionRemoved: BiFunction<RemoveContext, GConnection, Command>? = null
    private var onNodeRemoved: BiFunction<RemoveContext, GNode, Command>? = null

    override fun initialize(model: GModel) {
        this.model = model
    }

    override fun setOnConnectionRemoved(onConnectionRemoved: BiFunction<RemoveContext, GConnection, Command>) {
        this.onConnectionRemoved = onConnectionRemoved
    }

    override fun setOnNodeRemoved(onNodeRemoved: BiFunction<RemoveContext, GNode, Command>) {
        this.onNodeRemoved = onNodeRemoved
    }

    override fun updateLayoutValues(skinLookup: SkinLookup) {
        val command = CompoundCommand()
        model?.let {
            CommandStack.getCommandStack(it).suspendStackChangeNotifications()
            Commands.updateLayoutValues(command, it, skinLookup)
            if (command.canExecute()) {
                CommandStack.getCommandStack(it).execute(command)
            }
            CommandStack.getCommandStack(it).resumeStackChangeNotification()
        }
    }

    override fun remove(toRemove: Collection<Selectable>) {
        if (toRemove.isEmpty()) return
        val command = CompoundCommand()
        val editContext = RemoveContext()
        val delete: MutableList<Selectable> = mutableListOf()

        for (obj in toRemove) {
            if (obj is GNode && editContext.canRemove(obj)) {
                delete.add(obj)
                for (connector in obj.connectors) {
                    for (connection in connector.connections) {
                        connection?.let {
                            if (editContext.canRemove(connection)) {
                                delete.add(connection)
                            }
                        }
                    }
                }
            } else if (obj is GConnection && editContext.canRemove(obj)) {
                delete.add(obj)
            }
        }
        for (obj in delete) {
            if (obj is GNode) {
                model?.let { model -> command.append(RemoveCommand.create(model, { model.nodes }, obj)) }
                val onRemoved = onNodeRemoved?.apply(editContext, obj)
                onRemoved?.let { command.append(onRemoved) }
            } else if (obj is GConnection) {
                remove(editContext, command, obj)
            }
        }
        if (!command.isEmpty() && command.canExecute()) model?.let { CommandStack.getCommandStack(it).execute(command) }
    }

    private fun remove(removeContext: RemoveContext, command: CompoundCommand, toDelete: GConnection) {
        val source: GConnector? = toDelete.source
        val target: GConnector? = toDelete.target

        model?.let { model -> command.append(RemoveCommand.create(model, { model.connections }, toDelete)) }
        source?.let { source -> command.append(RemoveCommand.create(source, { source.connections }, toDelete)) }
        target?.let { target -> command.append(RemoveCommand.create(target, { target.connections }, toDelete)) }

        onConnectionRemoved?.apply(removeContext, toDelete)?.let {
            command.append(it)
        }
    }
}