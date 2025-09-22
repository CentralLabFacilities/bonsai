package de.unibi.citec.clf.btl.data.world

import de.unibi.citec.clf.btl.StampedType
import de.unibi.citec.clf.btl.data.geometry.Pose3D

open class Entity(val id: String, var modelName: String = "", var pose :Pose3D? = null) : StampedType(), Cloneable {

    override fun clone(): Entity {
        return Entity(id,modelName,Pose3D(pose)).also { it.frameId = frameId }
    }
    constructor(e: Entity) : this(e.id, e.modelName, Pose3D(e.pose)) {
        frameId = e.frameId
        timestamp = e.timestamp
    }

    override fun toString(): String {
        return "Entity: $id ($modelName) @ $pose in $frameId"
    }


}