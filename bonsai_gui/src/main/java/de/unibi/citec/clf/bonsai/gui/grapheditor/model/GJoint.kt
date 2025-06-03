package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import javafx.beans.property.SimpleDoubleProperty
import javafx.beans.property.SimpleObjectProperty
import javafx.beans.property.SimpleStringProperty
import javafx.beans.value.ChangeListener

class GJoint(): SelectableType() {

    private val _id = SimpleStringProperty(this, "id")
    fun idProperties() = _id
    var id: String?
        get() = _id.get()
        set(value) = _id.set(value)

    private val _connection = SimpleObjectProperty<GConnection>(this, "connection")
    fun connectionProperty() = _connection
    var connection: GConnection?
        get() = _connection.get()
        set(value) = _connection.set(value)

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

    private var xListener: ChangeListener<Number>? = null
    private var yListener: ChangeListener<Number>? = null

    fun addListeners(xListener: ChangeListener<Number>, yListener: ChangeListener<Number>) {
        removeListeners()
        this.xListener = xListener
        this.yListener = yListener
        xProperty().addListener(xListener)
        yProperty().addListener(yListener)
    }

    fun removeListeners() {
        xListener?.let {
            xProperty().removeListener(xListener)
            yProperty().removeListener(yListener)
        }
    }

    override fun toString(): String {
        return "GJoint [id=$id, connection=$connection, x=$x, y=$y]"
    }

}