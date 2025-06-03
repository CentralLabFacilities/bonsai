package de.unibi.citec.clf.bonsai.gui.grapheditor.model.command

abstract class AbstractCommand : Command{
    protected var executed = false

    override fun canExecute() : Boolean {
        return !executed
    }

    override fun canUndo(): Boolean {
        return executed
    }

    override fun toString(): String {
        return "AbstractCommand [executed=$executed]"
    }
}