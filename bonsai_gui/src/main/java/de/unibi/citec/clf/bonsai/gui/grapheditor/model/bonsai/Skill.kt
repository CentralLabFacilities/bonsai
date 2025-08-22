package de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai

import javafx.beans.property.SimpleStringProperty

/**
 * Simple representation of Bonsai-Skill used in graph model.
 */
class Skill(name: String) {

    val _name = SimpleStringProperty()
    var name: String
        get() = _name.get()
        set(value) = _name.set(value)
    fun nameProperty() = _name

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

    init {
        this.name = name
    }

    override fun toString(): String {
        return "Skill [name=$name, read_slots=$readSlots, write_slots=$writeSlots, required_vars=$requiredVars, optional_vars=$optionalVars, exit_status=$status]"
    }
}