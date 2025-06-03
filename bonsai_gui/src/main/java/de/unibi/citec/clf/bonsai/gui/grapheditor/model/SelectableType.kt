package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import javafx.beans.property.SimpleStringProperty

open class SelectableType: Selectable {
    override val _type = SimpleStringProperty(this, "type")
    /**
     * Type of the selectable component. Use only if actual property is needed.
     */
    fun typeProperty() = _type
    /**
     * Type of the selectable component.
     */
    var type: String?
        get() = _type.get()
        set(value) = _type.set(value)
}