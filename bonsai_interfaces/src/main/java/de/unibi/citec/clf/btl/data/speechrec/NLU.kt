package de.unibi.citec.clf.btl.data.speechrec

import de.unibi.citec.clf.btl.Type

/**
 * Domain class representing an natural language understanding
 *
 * @author lruegeme
 */
class NLU() : Type(), Iterable<NLUEntity?> {
    private var entityMap = HashMap<String, NLUEntity>()
    var text: String? = null
    var intent: String? = null
    var confidence = 0.0f

    constructor(t: String, i: String, conf: Float, entities: List<NLUEntity>) : this() {
        text = t
        intent = i
        confidence = conf
        for (e in entities) {
            entityMap[e.key] = e
        }
    }

    override fun iterator(): MutableIterator<NLUEntity> {
        return entityMap.values.iterator()
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as NLU

        if (entityMap != other.entityMap) return false
        if (text != other.text) return false
        if (intent != other.intent) return false

        return true
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + entityMap.hashCode()
        result = 31 * result + (text?.hashCode() ?: 0)
        result = 31 * result + (intent?.hashCode() ?: 0)
        result = 31 * result + confidence.hashCode()
        return result
    }

    override fun toString(): String {
        return "NLU(intent=$intent, confidence=$confidence text:'$text', entities ${entityMap.values})"
    }


}
