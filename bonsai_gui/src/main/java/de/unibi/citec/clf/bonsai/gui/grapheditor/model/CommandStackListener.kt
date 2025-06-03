package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import java.util.EventObject

fun interface CommandStackListener {
    fun commandStackChanged(event: EventObject)
}