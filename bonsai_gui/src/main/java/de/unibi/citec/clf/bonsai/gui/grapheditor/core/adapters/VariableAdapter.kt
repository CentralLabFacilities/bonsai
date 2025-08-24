package de.unibi.citec.clf.bonsai.gui.grapheditor.core.adapters

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.Skill
import javafx.beans.property.SimpleStringProperty

class VariableAdapter(variableName: String, variable: Skill.Variable) {

    val _name = SimpleStringProperty()
    fun nameProperty() = _name
    var name: String
        get() = _name.get()
        set(value) = _name.set(value)

    val _dataType = SimpleStringProperty()
    fun dataTypeProperty() = _dataType
    var dataType: String
        get() = _dataType.get()
        set(value) = _dataType.set(value)

    val _expression = SimpleStringProperty()
    fun expressionProperty() = _expression
    var expression: String
        get() = _expression.get()
        set(value) = _expression.set(value)

    init {
        this.name = variableName
        this.dataType = variable.dataType.simpleName
        this.expression = variable.expression.toString()
    }

}