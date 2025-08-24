package de.unibi.citec.clf.bonsai.gui.grapheditor.core.adapters

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.Skill
import javafx.beans.property.SimpleBooleanProperty
import javafx.beans.property.SimpleStringProperty

/**
 * Adapter class to be able to present slots in table view
 */
class SlotAdapter(slotName: String, slot: Skill.Slot) {

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

    val _xpath = SimpleStringProperty()
    fun xpathProperty() = _xpath
    var xpath: String
        get() = _xpath.get()
        set(value) = _xpath.set(value)

    val _read = SimpleBooleanProperty()
    fun readProperty() = _read
    var read: Boolean
        get() = _read.get()
        set(value) = _read.set(value)

    val _write = SimpleBooleanProperty()
    fun writeProperty() = _write
    var write: Boolean
        get() = _write.get()
        set(value) = _write.set(value)

    init {
        name = slotName
        dataType = slot.dataType.simpleName
        xpath = slot.xpath
        read = slot.read
        write = slot.write
    }


}