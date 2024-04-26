package de.unibi.citec.clf.btl.data.speechrec

import de.unibi.citec.clf.btl.Type

/**
 * NLU Entity
 *
 * @author lruegeme
 */
class NLUEntity(val key: String, val entity: String, val role: String?) : Type() {
    var entityScore = 0.0f
    var roleScore = 0.0f

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as NLUEntity

        if (key != other.key) return false
        if (entity != other.entity) return false
        if (role != other.role) return false

        return true
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + (key.hashCode() ?: 0)
        result = 31 * result + (entity.hashCode() ?: 0)
        result = 31 * result + (role?.hashCode() ?: 0)
        result = 31 * result + entityScore.hashCode()
        result = 31 * result + roleScore.hashCode()
        return result
    }

    override fun toString(): String {
        return "NLUEntity($key, entity=$entity, role=$role, entityScore=$entityScore, roleScore=$roleScore)"
    }
}
