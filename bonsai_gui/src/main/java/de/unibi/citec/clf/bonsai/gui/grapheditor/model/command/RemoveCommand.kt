package de.unibi.citec.clf.bonsai.gui.grapheditor.model.command

import javafx.collections.ObservableList

class RemoveCommand<T>(private val owner: Any, private val listSupplier: ModelListSupplier<T>, private val element: T): AbstractCommand() {

    companion object {
        /** Convenience method to create the remove command. */
        fun <S> create(owner: Any, listSupplier: ModelListSupplier<S>, element: S) : RemoveCommand<S> {
            return RemoveCommand(owner, listSupplier, element)
        }
    }

    override fun execute() {
        if (!executed && canExecute()) {
            listSupplier.getList(owner).remove(element)
            executed = true
        }
    }

    override fun undo() {
        if (executed && canUndo()) {
            listSupplier.getList(owner).add(element)
            executed = false
        }
    }

    fun interface ModelListSupplier<T> {
        fun getList(owner: Any): ObservableList<T>
    }
}