package de.unibi.citec.clf.btl.data.speechrec

import de.unibi.citec.clf.btl.Type

/**
 * NLU Entity
 *
 * @author lruegeme
 */
class NLUEntity(val key: String, val value: String, val role: String?, val group: Int?) : Type(), Cloneable {
    var entityScore = 0.0f
    var roleScore = 0.0f

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as NLUEntity

        if (key != other.key) return false
        if (value != other.value) return false
        if (role != other.role) return false
        if (group != other.group) return false

        return true
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + (key.hashCode() ?: 0)
        result = 31 * result + (value.hashCode() ?: 0)
        result = 31 * result + (role?.hashCode() ?: 0)
        result = 31 * result + (group?.hashCode() ?: 0)
        result = 31 * result + entityScore.hashCode()
        result = 31 * result + roleScore.hashCode()
        return result
    }

    override fun toString(): String {
        return "NLUEntity($key, entity=$value, role=$role, entityScore=$entityScore, roleScore=$roleScore)"
    }

    override fun clone(): NLUEntity {
        return NLUEntity(key,value, role, group).also { it.frameId = frameId }
    }

    constructor(e: NLUEntity) : this(e.key, e.value, e.role, e.group) {
        entityScore = e.entityScore
        roleScore = e.roleScore
        frameId = e.frameId
        timestamp = e.timestamp
    }
}
