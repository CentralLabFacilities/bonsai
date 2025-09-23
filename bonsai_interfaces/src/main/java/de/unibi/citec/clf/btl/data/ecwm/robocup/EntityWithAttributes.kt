package de.unibi.citec.clf.btl.data.ecwm.robocup

import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.world.Entity

class EntityWithAttributes(id: String, modelName: String = "", pose :Pose3D? = null, private var attributes : MutableMap<String, MutableList<String>> = HashMap()): Entity(id, modelName, pose), Cloneable {

    constructor(e: EntityWithAttributes) : this(e.id, e.modelName, e.pose, HashMap<String, MutableList<String>>().also { it.putAll(e.getAttributes()) })

    constructor(e: Entity, attributes: MutableMap<String, MutableList<String>> = HashMap()) : this(e.id, e.modelName, e.pose, attributes) {
        this.frameId = e.frameId
    }

    override fun clone(): EntityWithAttributes {
        return EntityWithAttributes(id,modelName,pose, HashMap<String, MutableList<String>>().also { it.putAll(attributes) })
    }

    fun copy() : EntityWithAttributes {
        val e = EntityWithAttributes(id,modelName,pose)
        for( kv in this.attributes) e.addAttributes(kv.key, kv.value)
        return e
    }

    fun getAttributes(): MutableMap<String, MutableList<String>> {
        return attributes
    }

    fun getFirstAttributeOrNull(key: String): String? {
        return attributes.getOrDefault(key, listOf()).firstOrNull()
    }

    fun getAttribute(key: String): List<String>? {
        return attributes[key]
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