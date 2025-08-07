package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import javafx.beans.property.SimpleDoubleProperty
import javafx.beans.property.SimpleStringProperty
import javafx.beans.value.ChangeListener
import javafx.collections.FXCollections
import javafx.collections.ListChangeListener
import javafx.collections.ObservableList

open class GNode() : SelectableType() {

    private val _id = SimpleStringProperty(this, "id")
    fun idProperty() = _id
    var id: String?
        get() = _id.get()
        set(value) = _id.set(value)

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

    private val _width = SimpleDoubleProperty(this, "width", 151.0)
    fun widthProperty() = _width
    var width: Double
        get() = _width.get()
        set(value) = _width.set(value)

    private val _height = SimpleDoubleProperty(this, "height", 101.0)
    fun heightProperty() = _height
    var height: Double
        get() = _height.get()
        set(value) = _height.set(value)

    val connectors: ObservableList<GConnector> = FXCollections.observableArrayList()

    private var xListener: ChangeListener<Number>? = null
    private var yListener: ChangeListener<Number>? = null
    private var widthListener: ChangeListener<Number>? = null
    private var heightListener: ChangeListener<Number>? = null
    private var typeListener: ChangeListener<String>? = null
    private var connectorsListener: ListChangeListener<GConnector>? = null

    init {
        connectors.addListener(ListChangeListener<GConnector> { change ->
            while (change.next()) {
                if (change.wasAdded()) {
                    for (connector in change.addedSubList) {
                        connector.parent = this
                    }
                }
                if (change.wasRemoved()) {
                    for (connector in change.removed) {
                        if (connector.parent == this) {
                            connector.parent = null
                        }
                    }
                }
            }
        })
    }

    fun addListeners(xListener: ChangeListener<Number>, yListener: ChangeListener<Number>,
                     widthListener: ChangeListener<Number>, heightListener: ChangeListener<Number>,
                     typeListener: ChangeListener<String>, connectorsListener: ListChangeListener<GConnector>) {

        removeListeners()

        this.xListener = xListener
        this.yListener = yListener
        this.widthListener = widthListener
        this.heightListener = heightListener
        this.typeListener = typeListener
        this.connectorsListener = connectorsListener

        xProperty().addListener(xListener)
        yProperty().addListener(yListener)
        widthProperty().addListener(widthListener)
        heightProperty().addListener(heightListener)
        typeProperty().addListener(typeListener)
        connectors.addListener(connectorsListener)
    }

    fun removeListeners() {
        xListener?.let { xProperty().removeListener(it) }
        yListener?.let { yProperty().removeListener(it) }
        widthListener?.let { widthProperty().removeListener(it) }
        heightListener?.let { heightProperty().removeListener(it) }
        typeListener?.let { typeProperty().removeListener(it) }
        connectorsListener?.let { connectors.removeListener(it) }
    }

    override fun toString(): String {
        return "GNode [id=$id, x=$x, y=$y, width=$width, height=$height, connectors=${connectors.size}]"
    }
}