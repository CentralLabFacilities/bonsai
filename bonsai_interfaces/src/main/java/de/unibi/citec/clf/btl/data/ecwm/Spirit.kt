package de.unibi.citec.clf.btl.data.ecwm

import de.unibi.citec.clf.btl.Type
import de.unibi.citec.clf.btl.data.world.Entity

/**
 *
 */
open class Spirit(val entity: Entity, var affordance: String, val storage: String = "") : Type(), Cloneable {

    override fun clone(): Spirit {
        return Spirit(entity, affordance, storage)
    }
    constructor(e: Spirit) : this(e.entity, e.affordance,  e.storage) {
    }

    override fun toString(): String {
        return "Spirit: $affordance in $storage for $entity"
    }


}