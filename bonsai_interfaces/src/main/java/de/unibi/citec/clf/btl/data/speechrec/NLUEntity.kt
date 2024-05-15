package de.unibi.citec.clf.btl.data.speechrec

import de.unibi.citec.clf.btl.Type
import de.unibi.citec.clf.btl.data.geometry.Pose3D

/**
 * NLU Entity
 *
 * @author lruegeme
 */
class NLUEntity(val key: String, val entity: String, val role: String?, val group: Int?) : Type(), Cloneable {
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
        if (group != other.group) return false

        return true
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + (key.hashCode() ?: 0)
        result = 31 * result + (entity.hashCode() ?: 0)
        result = 31 * result + (role?.hashCode() ?: 0)
        result = 31 * result + (group?.hashCode() ?: 0)
        result = 31 * result + entityScore.hashCode()
        result = 31 * result + roleScore.hashCode()
        return result
    }

    override fun toString(): String {
        return "NLUEntity($key, entity=$entity, role=$role, entityScore=$entityScore, roleScore=$roleScore)"
    }

    override fun clone(): NLUEntity {
        return NLUEntity(key,entity, role, group).also { it.frameId = frameId }
    }

    constructor(e: NLUEntity) : this(e.key, e.entity, e.role, e.group) {
        entityScore = e.entityScore
        roleScore = e.roleScore
        frameId = e.frameId
        timestamp = e.timestamp
    }
}
