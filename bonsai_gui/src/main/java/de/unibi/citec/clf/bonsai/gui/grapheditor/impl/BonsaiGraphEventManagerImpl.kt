package de.unibi.citec.clf.bonsai.gui.grapheditor.impl

import de.unibi.citec.clf.bonsai.gui.grapheditor.utils.BonsaiGraphEventManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.utils.BonsaiGraphInputGesture
import javafx.event.Event

class BonsaiGraphEventManagerImpl: BonsaiGraphEventManager {

    private lateinit var gesture: BonsaiGraphInputGesture
    private lateinit var owner: Any

    override fun activateGesture(gesture: BonsaiGraphInputGesture, event: Event, owner: Any): Boolean {
        TODO("Not yet implemented")
    }

    override fun finishGesture(expectedGesture: BonsaiGraphInputGesture, owner: Any): Boolean {
        TODO("Not yet implemented")
    }

    companion object {
        fun canOverwrite(existing: Any, candidate: Any): Boolean {
            return when(candidate) {
                is 
            }
        }
    }
}