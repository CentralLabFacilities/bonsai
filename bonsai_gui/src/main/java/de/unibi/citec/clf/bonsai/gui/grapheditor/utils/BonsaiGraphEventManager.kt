package de.unibi.citec.clf.bonsai.gui.grapheditor.utils

import javafx.event.Event

interface BonsaiGraphEventManager {
    fun activateGesture(gesture: BonsaiGraphInputGesture, event: Event, owner: Any): Boolean
    fun finishGesture(expectedGesture: BonsaiGraphInputGesture, owner: Any): Boolean
}