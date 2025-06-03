package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import javafx.beans.property.SimpleBooleanProperty
import javafx.beans.property.SimpleObjectProperty
import javafx.beans.property.SimpleStringProperty
import javafx.beans.value.ChangeListener
import javafx.collections.FXCollections
import javafx.collections.ListChangeListener
import javafx.collections.ObservableList

class GConnection() : SelectableType() {

    private val _id = SimpleStringProperty(this, "id")
    fun idProperty() = _id
    var id: String?
        get() = _id.get()
        set(value) = _id.set(value)

    private val _source = SimpleObjectProperty<GConnector>(this, "source")
    fun sourceProperty() = _source
    var source: GConnector
        get() = _source.get()
        set(value) = _source.set(value)

    private val _target = SimpleObjectProperty<GConnector>(this, "target")
    fun targetProperty() = _target
    var target: GConnector
        get() = _target.get()
        set(value) = _target.set(value)

    private val _bidirectional = SimpleBooleanProperty(this, "bidirectional", false)
    fun bidirectionalProperty() = _bidirectional
    var bidirectional: Boolean
        get() = _bidirectional.get()
        set(value) = _bidirectional.set(value)

    val joints: ObservableList<GJoint> = FXCollections.observableArrayList()

    private var sourceListener: ChangeListener<GConnector>? = null
    private var targetListener: ChangeListener<GConnector>? = null
    private var typeListener: ChangeListener<String>? = null
    private var bidirectionalListener: ChangeListener<Boolean>? = null
    private var jointsListener: ListChangeListener<GJoint>? = null

    fun addListeners(sourceListener: ChangeListener<GConnector>, targetListener: ChangeListener<GConnector>,
                     typeListener: ChangeListener<String>, bidirectionalListener: ChangeListener<Boolean>,
                     jointsListener: ListChangeListener<GJoint>) {

        removeListeners()

        this.sourceListener = sourceListener
        this.targetListener = targetListener
        this.typeListener = typeListener
        this.bidirectionalListener = bidirectionalListener
        this.jointsListener = jointsListener

        sourceProperty().addListener(sourceListener)
        targetProperty().addListener(targetListener)
        typeProperty().addListener(typeListener)
        bidirectionalProperty().addListener(bidirectionalListener)
        joints.addListener(jointsListener)
    }

    fun removeListeners() {
        sourceListener?.let { sourceProperty().removeListener(it) }
        targetListener?.let { targetProperty().removeListener(it) }
        typeListener?.let { typeProperty().removeListener(it) }
        bidirectionalListener?.let { bidirectionalProperty().removeListener(it) }
        jointsListener?.let { joints.removeListener(it) }

    }

    fun addJoint(joint: GJoint) {
        if (!joints.contains(joint)) {
            joints.add(joint)
            joint.connection = this
        }
    }

    fun removeJoint(joint: GJoint) {
        if (joints.contains(joint)) {
            joints.remove(joint)
            joint.connection = null
        }
    }

    override fun toString(): String {
        return "GConnection [id=$id, source=$source, target=$target, joints=${joints.size}, bidirectional=$bidirectional]"
    }

}