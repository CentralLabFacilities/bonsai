package de.unibi.citec.clf.bonsai.gui.grapheditor.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.GComponent

class RemoveContext {

    private val objectsToDelete: MutableCollection<GComponent> = HashSet()

    fun canRemove(toCheck: GComponent): Boolean {
        return objectsToDelete.add(toCheck)
    }

    fun contains(toCheck: GComponent): Boolean {
        return objectsToDelete.contains(toCheck)
    }
}