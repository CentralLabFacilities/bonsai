package de.unibi.citec.clf.btl.data.ecwm.robocup

import de.unibi.citec.clf.btl.Type
import de.unibi.citec.clf.btl.data.world.Entity

open class EntityStorage(val entity: Entity, var storage: String? = null) : Type(), Cloneable {

    override fun clone(): EntityStorage {
        return EntityStorage(Entity(entity), storage)
    }
    constructor(e: EntityStorage): this(Entity(e.entity), e.storage)

    override fun toString(): String {
        return "EntityStorage: Storage: $storage for $entity.name ($entity.type) @ $entity.pose in ${entity.frameId}"
    }
}