package de.unibi.citec.clf.bonsai.engine.config.fault

import de.unibi.citec.clf.bonsai.engine.model.StateID
import java.util.*

/**
 * @author lruegeme
 */
class MissingSlotFault {
    var state: StateID
        private set
    var slotKey: String
        private set
    var type: Class<*> = Objects::class.java
        private set
    var isError = true
        private set

    constructor(slotKey: String, state: StateID, type: Class<*>) {
        this.slotKey = slotKey
        this.state = state
        this.type = type
    }

    constructor(slotKey: String, state: StateID, type: Class<*>, error: Boolean) {
        this.slotKey = slotKey
        this.state = state
        this.type = type
        isError = error
    }

    val message: String
        get() = if (isError) {
            "Missing slot definition with key '$slotKey' for state '${state.getCanonicalID()}' of type '$type'"
        } else {
            "Default slot definition with key '$slotKey' for state '${state.getCanonicalID()}' of type '$type' xpath is $slotKey"
        }

    companion object {
        private const val serialVersionUID = 5250728310328591284L
    }
}
