package de.unibi.citec.clf.btl.data.ecwm.robocup

import de.unibi.citec.clf.btl.data.world.Model
import kotlin.collections.iterator

class ModelWithAttributes(typeName: String, private var attributes : MutableMap<String, MutableList<String>> = HashMap()): Model(typeName), Cloneable {

    constructor(m: ModelWithAttributes) : this(m.typeName, HashMap<String, MutableList<String>>().also { it.putAll(m.getAttributes()) })

    override fun clone(): ModelWithAttributes {
        return ModelWithAttributes(typeName, HashMap<String, MutableList<String>>().also { it.putAll(attributes) })
    }

    fun copy() : ModelWithAttributes {
        val e = ModelWithAttributes(this.typeName)
        for( kv in this.attributes) e.addAttributes(kv.key, kv.value)
        return e
    }

    fun getAttributes(): MutableMap<String, MutableList<String>> {
        return attributes
    }

    fun getFirstAttributeOrNull(key: String): String? {
        return attributes.getOrDefault(key, listOf()).firstOrNull()
    }

    fun addAttribute(attribute: String, value: String) {
        if(!attributes.containsKey(attribute)) {
            attributes[attribute] = mutableListOf()
        }
        attributes[attribute]!!.add(value)
    }

    fun addAttributes(attribute: String, values : List<String>) {
        if(!attributes.containsKey(attribute)) {
            attributes[attribute] = mutableListOf()
        }
        attributes[attribute]!!.addAll(values)
    }

    fun hasAttribute(attribute: String): Boolean {
        return attributes.containsKey(attribute)
    }

    fun hasAttributeWithValue(attribute: String, value: String): Boolean {
        return attributes[attribute]?.contains(value) == true
    }
}