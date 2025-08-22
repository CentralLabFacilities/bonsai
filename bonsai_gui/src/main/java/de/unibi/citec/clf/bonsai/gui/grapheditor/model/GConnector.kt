package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import javafx.beans.property.SimpleBooleanProperty
import javafx.beans.property.SimpleDoubleProperty
import javafx.beans.property.SimpleObjectProperty
import javafx.beans.property.SimpleStringProperty
import javafx.collections.FXCollections
import javafx.collections.ObservableList

class GConnector(): SelectableType() {

    constructor(type: String) : this() {
        this.type = type
    }

    constructor(type: String, parent: GNode) : this() {
        this.type = type
        this.parent = parent
    }

    private val _id = SimpleStringProperty(this, "id")
    fun idProperty() = _id
    var id: String?
        get() = _id.get()
        set(value) = _id.set(value)

    private val _parent = SimpleObjectProperty<GNode>(this, "parent")
    fun parentProperty() = _parent
    var parent: GNode?
        get() = _parent.get()
        set(value) = _parent.set(value)

    private val _x = SimpleDoubleProperty(this, "x", 0.0)
    fun xProperty() = _x
    var x: Double
        get() = _x.get()
        set(value) = _x.set(value)

    private val _y = SimpleDoubleProperty(this, "y", 0.0)
    fun yProperty() = _y
    var y: Double
        get() = _y.get()
        set(value) = _y.set(value)

    private val _connectionDetachedOnDrag = SimpleBooleanProperty(this, "connectionDetachedOnDrag", true)
    fun connectionDetachedOnDragProperty() = _connectionDetachedOnDrag
    var connectionDetachedOnDrag: Boolean
        get() = _connectionDetachedOnDrag.get()
        set(value) = _connectionDetachedOnDrag.set(value)

    val connections: ObservableList<GConnection> = FXCollections.observableArrayList()

    override fun toString(): String {
        return "GConnector[id=$id, type=$type, parent=$parent, x=$x, y=$y, connectionDetachedOnDrag=$connectionDetachedOnDrag]"
    }

}