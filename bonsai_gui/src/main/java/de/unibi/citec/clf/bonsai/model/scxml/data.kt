package de.unibi.citec.clf.bonsai.model.scxml

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import nl.adaptivity.xmlutil.serialization.XmlElement

@Serializable
sealed interface Action {
    @Serializable
    @SerialName("send")
    data class Send(var event: String) : Action

    @Serializable
    @SerialName("assign")
    data class Assign(var location: String, var expr: String) : Action
}

@Serializable
@SerialName("onentry")
data class OnEntry(@XmlElement(true) val actions: List<Action>)

@Serializable
@SerialName("onexit")
data class OnExit(@XmlElement(true) val actions: List<Action>)

@Serializable
@SerialName("slot")
data class Slot(val key: String, val state: String, val xpath: String)

@Serializable
@SerialName("slots")
data class Slots(@XmlElement(true) val data: List<Slot>?)

@ConsistentCopyVisibility
@Serializable
@SerialName("data")
data class Data internal constructor(
    val id: String,
    val expr: String?,
    @XmlElement(true) internal val slots: Slots? = null
) {
    constructor(id : String, expr: String) : this(id, expr, null)

}

@Serializable
@SerialName("datamodel")
data class DataModel(@XmlElement(true) val data: List<Data>)

@Serializable
@SerialName("transition")
data class Transition(
    val event: String,
    val target: String?,
    val cond: String? = null,
    @XmlElement(true) val actions: List<Action>? = null
)

@ConsistentCopyVisibility
@Serializable
@SerialName("state")
data class State private constructor(
    val id: String,

    @XmlElement(true)
    private val datamodel: DataModel? = null,

    @XmlElement(true)
    val transition: List<Transition>? = null,

    @XmlElement(true) val onentry: OnEntry? = null,
    @XmlElement(true) val onexit: OnExit? = null,

    @XmlElement(true) val subStates: List<State>? = null,
    val initial : String? = null,

    val src: String? = null,
) {
    constructor(
        id: String,
        datamodel: List<Data>? = null,
        transition: List<Transition>? = null,
        onentry: List<Action>? = null,
        onexit: List<Action>? = null,
        subStates: List<State>? = null,
        initial: String? = null,
        src: String? = null,
    ) : this(
        id = id,
        datamodel = if (datamodel != null) DataModel(datamodel) else null,
        transition = transition,
        onentry = if (onentry != null) OnEntry(onentry) else null,
        onexit = if (onexit != null) OnExit(onexit) else null,
        subStates = subStates,
        initial = initial,
        src = src,
    )

    val data: List<Data> get() = datamodel?.data ?: listOf()
}

@ConsistentCopyVisibility
@Serializable
data class SCXML private constructor(
    private val datamodel: DataModel,
    val initial: String,
    @XmlElement(true)
    val states: List<State>
) {

    constructor(initial: String, states: List<State>, data: List<Data>?, slots: List<Slot>?) : this(
        datamodel = DataModel(mutableListOf<Data>().also {
            if (data != null) it.addAll(data)
            if (slots!=null) it.add(Data("#_SLOTS", null, Slots(slots)))
        }),
        initial = initial,
        states = states
    )

    val data: List<Data> get() = datamodel.data.filter { it.slots == null}
    val slots: List<Slot> get() = datamodel.data.find { it.slots != null }?.slots?.data ?: listOf()

}