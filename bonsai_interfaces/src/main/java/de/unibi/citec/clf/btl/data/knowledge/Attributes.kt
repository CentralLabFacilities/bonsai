package de.unibi.citec.clf.btl.data.knowledge

import de.unibi.citec.clf.btl.Type

/**
 * This class represents knowledge attributes (key=listOf(values)) of a specific reference.
 *
 * example reference 'object:coke' could have the following attribute key:values
 *   categories: drink,lemonade
 *   alternative_names: cola,coke,pepsi
 *   color: dark
 *   ref_isa: cat:lemonade,object
 *
 */
class Attributes private constructor(var attributeListMap : MutableMap<String, MutableList<String>> = HashMap()) : Type(), Cloneable {
    lateinit var reference: String
        private set

    constructor(reference : String, attributeListMap : MutableMap<String, MutableList<String>>) : this(HashMap<String, MutableList<String>>().also { it.putAll(attributeListMap) }) {
        this.reference = reference
    }

    override fun clone(): Attributes {
        return Attributes(reference, HashMap<String, MutableList<String>>().also {
            for (values in attributeListMap) {
                val list = mutableListOf<String>()
                list.addAll(values.value)
                it[values.key] = list
            }
        }
        )
    }

    constructor(a: Attributes) : this(a.reference, HashMap<String, MutableList<String>>().also {
        for (values in a.attributeListMap) {
            val list = mutableListOf<String>()
            list.addAll(values.value)
            it[values.key] = list
        }
    }
    )

    fun getFirstAttributeOrNull(key: String): String? {
        return attributeListMap.getOrDefault(key, listOf()).firstOrNull()
    }

    fun getAttribute(key: String): List<String>? {
        return attributeListMap[key]
    }

    fun hasAttribute(attribute: String): Boolean {
        return attributeListMap.containsKey(attribute)
    }

    fun attributeContains(attribute: String, value: String): Boolean {
        return attributeListMap[attribute]?.contains(value) == true
    }

    fun addAttribute(attribute: String, value: String) {
        if(!attributeListMap.containsKey(attribute)) {
            attributeListMap[attribute] = mutableListOf()
        }
        attributeListMap[attribute]!!.add(value)
    }

    fun addAttributes(attribute: String, values : List<String>) {
        if(!attributeListMap.containsKey(attribute)) {
            attributeListMap[attribute] = mutableListOf()
        }
        attributeListMap[attribute]!!.addAll(values)
    }

    companion object {
        @JvmStatic
        fun empty(): Attributes {
            return Attributes()
        }

    }

}
