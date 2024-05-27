package de.unibi.citec.clf.btl.data.speechrec

import de.unibi.citec.clf.btl.Type

/**
 * Domain class representing an natural language understanding
 *
 * @author lruegeme
 */
class NLU() : Type(), Iterable<NLUEntity?>, Cloneable {
    private var entities : MutableList<NLUEntity> = ArrayList()
    var text: String = ""
    var intent: String = ""
    var confidence = 0.0f

    constructor(t: String, i: String, conf: Float, es: List<NLUEntity>) : this() {
        text = t
        intent = i
        confidence = conf
        entities.addAll(es)
    }

    override fun iterator(): MutableIterator<NLUEntity> {
        return entities.iterator()
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as NLU

        if (entities != other.entities) return false
        if (text != other.text) return false
        if (intent != other.intent) return false

        return true
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + entities.hashCode()
        result = 31 * result + (text?.hashCode() ?: 0)
        result = 31 * result + (intent?.hashCode() ?: 0)
        result = 31 * result + confidence.hashCode()
        return result
    }

    override fun toString(): String {
        return "NLU(intent=$intent, confidence=$confidence text:'$text', entities ${entities})"
    }

    override fun clone(): NLU {
        return NLU(text,intent, confidence, entities).also { it.frameId = frameId }
    }

    fun hasEntity(key: String): Boolean {
        return entities.any { it.key == key }
    }

    fun hasAllEntities(keys : Collection<String>): Boolean {
        return entities.map { it.key }.containsAll(keys)
    }

    fun getEntities() : List<NLUEntity> {
        return entities
    }


}
