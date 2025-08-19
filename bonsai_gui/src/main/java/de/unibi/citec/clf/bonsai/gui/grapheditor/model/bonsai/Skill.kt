package de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai

/**
 * Simple representation of Bonsai-Skill used in graph model.
 */
class Skill(val name: String) {
    /**
     * Contains read-slots of skill as key-value pair <xpath, simple name>.
     */
    val readSlots = mutableMapOf<String, String>()

    /**
     * Contains write-slots of skill as key-value pair <xpath, simple name>.
     */
    val writeSlots = mutableMapOf<String, String>()

    /**
     * Contains required variables of skill as key-value pair <id, expression>.
     */
    val requiredVars = mutableMapOf<String, String>()

    /**
     * Contains optional variables of skill as key-value pair <id, expression>.
     */
    val optionalVars = mutableMapOf<String, String>()

    /**
     * Contains transitions of skill as key-value pair <transition, GeneralTransitionType>. Each Skill should have an
     * 'inbound' transition.
     */
    val transitions = mutableMapOf<String,TransitionType>("inbound" to TransitionType.INBOUND)

    /**
     * Adds transition and gets matching general transition type.
     * @param transition Transition to be added
     */
    fun addTransition(transition: String) {
        transitions[transition] = TransitionType.getGeneralTransitionType(transition)
    }

    /**
     * Adds bunch of transitions and gets matching general transition types.
     * @param transitions List of transitions to be added
     */
    fun addTransitions(transitions: List<String>) {
        for (transition in transitions) {
            addTransition(transition)
        }
    }

    /**
     * Removes given transition.
     * @param transition Transition to be removed
     */
    fun removeTransition(transition: String) {
        transitions.remove(transition)
    }


}