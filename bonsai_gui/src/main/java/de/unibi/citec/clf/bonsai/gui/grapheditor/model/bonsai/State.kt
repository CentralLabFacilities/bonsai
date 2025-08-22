package de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai

import org.apache.log4j.Logger
import java.util.Locale.getDefault

/**
 * Simple representation of scxml-State used in graph model.
 */
class State(id: String = "") {

    companion object {
        private val logger = Logger.getLogger(State::class.java)
    }

    /**
     * Bonsai skill called in state. If state is not simple (e.g. contains sub-states) skill is null.
     * Note: Skill can only be set if subStates is empty!
     */
    var skill: Skill? = null
        set(value) {
            if (subStates.isEmpty()) {
                field = value
                id = value?.name ?: ""
                value?.let {
                    for (status in it.status) {
                        transitions.add(status.status.name.lowercase(getDefault()) + "." + status.statusSuffix)
                    }
                }
            } else {
                logger.error("State is not simple, can't add skill")
                throw Exception("State configuration error")
            }
        }

    /**
     * List containing all available transitions
     */
    val transitions = mutableListOf<String>()

    private val subStates = mutableListOf<State>()

    /**
     * Whether state is a final state (e.g. 'End', 'Error',...) or not.
     */
    var final: Boolean = false

    /**
     * State's id. Only unique identifier (e.g. part after '#') needs to be set - name of skill (if set) will be prepended automatically
     */
    var id: String = ""
        set(value) {
            field = skill?.let { it.name + "#" + value } ?: value
        }

    /**
     * Checks if state is simple.
     * @return Whether the state is simple or not.
     */
    fun isSimple(): Boolean {
        return skill != null
    }

    /**
     * Adds new sub-state to state.
     * Note: Sub-states can only be added if state is not simple, e.g. state is null!
     * @param subState Sub-State to be added to state
     *
     */
    fun addSubState(subState: State) {
        if (isSimple()) {
            logger.error("State is simple, can't add sub-state!")
            throw Exception("State configuration error")
        } else {
            subStates.add(subState)
        }
    }

    /**
     * Removes given sub-state.
     * @param subState Sub-State to be removed
     */
    fun removeSubState(subState: State) {
        subStates.remove(subState)
    }

    init {
        this.id = id
    }
}