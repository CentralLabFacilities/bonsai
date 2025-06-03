package de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable

/**
 * Context to keep track of the objects to be deleted in a remove operation.
 * This is necessary to prevent creation of remove commands removing the same
 * objects multiple times which will lead to errors.
 */
class RemoveContext {

    private val objectsToDelete: MutableCollection<Selectable> = mutableSetOf()

    /**
     * @param toCheck
     *            {@link Selectable} to check
     * @return {@code true} if no other involved party has created a delete
     *         command for the given object otherwise {@code false}
     */
    fun canRemove(toCheck: Selectable): Boolean {
        return objectsToDelete.add(toCheck)
    }

    /**
     * @param toCheck
     *            {@link Selectable} to check
     * @return {@code true} any involved party has created a delete command for
     *         the given object otherwise {@code false}
     */
    fun contains(toCheck: Selectable): Boolean {
        return objectsToDelete.contains(toCheck)
    }
}