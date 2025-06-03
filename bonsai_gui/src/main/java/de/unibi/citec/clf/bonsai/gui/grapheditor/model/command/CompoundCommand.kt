package de.unibi.citec.clf.bonsai.gui.grapheditor.model.command

import javafx.beans.property.SimpleBooleanProperty
import javafx.collections.FXCollections
import javafx.collections.ObservableList

class CompoundCommand: Command {

    val commands: ObservableList<Command> = FXCollections.observableArrayList()
    private val _executed = object : SimpleBooleanProperty(false) {
    }
    fun executedProperty() = _executed
    var executed: Boolean
        get() = _executed.get()
        set(value) = _executed.set(value)

    fun append(command: Command) {
        if (!executed) {
            commands.add(command)
        }
    }

    override fun execute() {
        if (!executed) {
            for (command in commands) {
                if (command.canExecute()) command.execute()
            }
            executed = true
        }
    }

    override fun undo() {
        if (executed) {
            for (command in commands.reversed()) {
                if (command.canUndo()) command.undo()
            }
            executed = false
        }
    }

    override fun canExecute(): Boolean {
        return !executed && commands.all { it.canExecute() }
    }

    override fun canUndo(): Boolean {
        return executed && commands.all { it.canUndo() }
    }

    fun isEmpty() : Boolean {
        return commands.isEmpty()
    }

    override fun toString(): String {
        return "CompoundCommand [commands=$commands, executed=$executed]"
    }
}