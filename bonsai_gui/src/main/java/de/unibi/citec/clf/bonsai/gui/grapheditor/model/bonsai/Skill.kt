package de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai

/**
 * Simple representation of Bonsai-Skill used in graph model.
 */
class Skill(val name: String) {

    /**
     * Represents slots of skill.
     */
    data class Slot(val dataType: Class<*>, var xpath: String = "")

    /**
     * Represents variables of skill.
     */
    data class Variable(val dataType: Class<*>, var expression: Any?)

    /**
     * Contains read-slots of skill as key-value pair <simple name, slot>.
     */
    val readSlots = mutableMapOf<String, Slot>()

    /**
     * Contains write-slots of skill as key-value pair <simple name, slot>.
     */
    val writeSlots = mutableMapOf<String, Slot>()

    /**
     * Contains required variables of skill as key-value pair <id, variables>.
     */
    val requiredVars = mutableMapOf<String, Variable>()

    /**
     * Contains optional variables of skill as key-value pair <id, variables>.
     */
    val optionalVars = mutableMapOf<String, Variable>()

    /**
     * Contains all available exit-stati of skill as List of ExitStatus.
     */
    val status = mutableListOf<ExitStatus>()

    override fun toString(): String {
        return "Skill [name=$name, read_slots=$readSlots, write_slots=$writeSlots, required_vars=$requiredVars, optional_vars=$optionalVars, exit_status=$status]"
    }
}