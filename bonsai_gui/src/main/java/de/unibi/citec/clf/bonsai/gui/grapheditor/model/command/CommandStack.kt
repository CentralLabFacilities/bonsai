package de.unibi.citec.clf.bonsai.gui.grapheditor.model.command

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.CommandStackListener
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import javafx.beans.property.SimpleBooleanProperty
import javafx.beans.property.SimpleIntegerProperty
import javafx.collections.FXCollections
import javafx.collections.ListChangeListener
import javafx.collections.ObservableList
import java.util.*


/**
 * The BasicCommandStack class manages the execution, undoing, and redoing of commands.
 * It uses JavaFX properties to integrate seamlessly with JavaFX UI components.
 */
class CommandStack {

    companion object {
        /** The singleton command stack. */
        val commandStacks: MutableMap<GModel, CommandStack> = hashMapOf()

        /** Return the command stack (currently a singleton). */
        fun getCommandStack(model: GModel): CommandStack {
            return commandStacks.getOrPut(model) { CommandStack() }
        }
    }

    /**
     * The list of executed commands.
     */
    val commands: ObservableList<Command> = FXCollections.observableArrayList()

    private val _top = SimpleIntegerProperty(-1)

    /**
     * The index of the last executed command in the commands list. Use only if the actual property is needed.
     */
    fun topProperty() = _top

    /**
     * The index of the last executed command in the commands list.
     */
    var top: Int
        get() = _top.get()
        set(value) = _top.set(value)

    private val _canUndo = SimpleBooleanProperty(false)

    /**
     * Indicates whether an undo operation can be performed. Use only if the actual property is needed.
     */
    fun canUndoProperty() = _canUndo

    /**
     * Indicates whether an undo operation can be performed.
     */
    var canUndo: Boolean
        get() = _canUndo.get()
        set(value) = _canUndo.set(value)

    private val _canRedo = SimpleBooleanProperty(false)

    /**
     * Indicates whether a redo operation can be performed. Use only if the actual property is needed.
     */
    fun canRedoProperty() = _canRedo

    /**
     * Indicates whether a redo operation can be performed.
     */
    var canRedo: Boolean
        get() = _canRedo.get()
        set(value) = _canRedo.set(value)

    private var stackChangeNotificationSuspended = false

    /** The command stack listener. **/
    var listener: CommandStackListener? = null

    var listChangeListener = ListChangeListener<Command> { change ->
        if (!stackChangeNotificationSuspended && listener != null) {
            while (change.next()) {
            }
            if (change.wasAdded() || change.wasRemoved()) {
                val event = EventObject(change)
                listener!!.commandStackChanged(event)
            }
        }
    }

    init {
        _top.addListener { _, _, _ -> updateCanUndoRedo() }
        commands.addListener(listChangeListener)
    }

    /** Emulate the commandStackChanged call from the commands observable list.
     *
     * @param listener
     */
    fun addCommandStackListener(listener: CommandStackListener) {
        this.listener = listener
    }

    /** Remove the listener
     *
     * @param listener unused but provided for compatibility
     */
    fun removeCommandStackListener(listener: CommandStackListener) {
        this.listener = null
    }

    /**
     * Suspend notifications to the listeners.
     */
    fun suspendStackChangeNotifications() {
        stackChangeNotificationSuspended = true
    }

    /**
     * Resume notifications to the listeners.
     */
    fun resumeStackChangeNotification() {
        stackChangeNotificationSuspended = false
    }

    /**
     * Executes the given command and adds it to the command stack.
     *
     * @param command the command to execute.
     */
    fun execute(command: Command) {
        if (command.canExecute()) {
            command.execute()
            if (commands.size > top + 1) {
                commands.subList(top + 1, commands.size).clear()
            }
            commands.add(command)
            top++
        }
    }

    /**
     * Undoes the last executed command.
     */
    fun undo() {
        if (canUndo) {
            val command = commands[top]
            command.undo()
            top--
        }
    }


    /**
     * Redoes the last undone command.
     */
    fun redo() {
        if (canRedo) {
            top++
            val command = commands[top]
            command.execute()
        }
    }

    /**
     * Determines if an undo operation can be performed.
     *
     * @return true if undo is available; false otherwise.
     */
    fun canUndo(): Boolean {
        return canUndo
    }

    /**
     * Resets the whole command stack.
     */
    fun flush() {
        commands.clear()
        canUndo = false
        canRedo = false
        top = -1
    }

    /**
     * Returns the property representing the ability to undo.
     *
     * @return the canUndo property.
     */
    fun canRedo(): Boolean {
        return canRedo
    }

    private fun updateCanUndoRedo() {
        var command: Command? = null
        canUndo = top >= 0 && commands.getOrNull(top)?.also { command = it }?.canUndo() == true
        canRedo = (top + 1 < commands.size) && commands.getOrNull(top + 1)?.also { command = it }?.canExecute() == true
    }

    override fun toString(): String {
        return "CommandStack: [#CommandsInQueue:${commands.size}, #CommandsExecuted:$top, Command on top: $commands]"
    }
}