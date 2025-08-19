package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.Skill
import javafx.beans.property.SimpleDoubleProperty
import javafx.beans.property.SimpleStringProperty
import javafx.collections.FXCollections
import javafx.collections.ObservableList

class GModel {
    val nodes: ObservableList<GNode> = FXCollections.observableArrayList()
    val connections: ObservableList<GConnection?> = FXCollections.observableArrayList()
    val availableSkills: ObservableList<Skill> = FXCollections.observableArrayList()

    private val _type = SimpleStringProperty(this, "type")
    fun typeProperty() = _type
    var type: String
        get() = _type.get()
        set(value) = _type.set(value)

    private val _contentWidth = SimpleDoubleProperty(this, "contentWidth", 3000.0)
    fun contentWidthProperty() = _contentWidth
    var contentWidth: Double
        get() = _contentWidth.get()
        set(value) = _contentWidth.set(value)

    private val _contentHeight = SimpleDoubleProperty(this, "contentHeight", 2250.0)
    fun contentHeightProperty() = _contentHeight
    var contentHeight: Double
        get() = _contentHeight.get()
        set(value) = _contentHeight.set(value)

    override fun toString(): String {
        return "GModel [#nodes=${nodes.size}, #connections=${connections.size}]"
    }

}