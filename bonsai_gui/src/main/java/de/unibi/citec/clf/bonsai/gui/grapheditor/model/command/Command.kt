package de.unibi.citec.clf.bonsai.gui.grapheditor.model.command

/**
 * The Command interface represents an executable action with undo and redo capabilities.
 */
interface Command {

    /**
     * Executes the command.
     */
    fun execute()

    /**
     * Undoes the command.
     */
    fun undo()

    /**
     * Determines if the command can be executed.
     *
     * @return true if the command can be executed; false otherwise.
     */
    fun canExecute(): Boolean

    /**
     * Determines if the command can be undone.
     *
     * @return true if the command can be undone; false otherwise.
     */
    fun canUndo(): Boolean
}