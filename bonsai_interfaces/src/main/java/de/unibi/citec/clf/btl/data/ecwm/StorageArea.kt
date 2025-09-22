package de.unibi.citec.clf.btl.data.ecwm

import de.unibi.citec.clf.btl.StampedType
import java.util.*

open class StorageArea(val name: String, val sizeX: Double, val sizeY: Double, val sizeZ: Double) : StampedType(), Cloneable{

    override fun clone(): StorageArea {
        return StorageArea(name, sizeX, sizeY, sizeZ).also { it.frameId = frameId }
    }
    constructor(s: StorageArea) : this(s.name, s.sizeX, s.sizeY, s.sizeZ) {
        frameId = s.frameId
    }

    override fun toString(): String {
        return "$name [$sizeX, $sizeY, $sizeZ]"
    }

    override fun equals(other: Any?): Boolean {
        return super.equals(other) && other is StorageArea && other.name == this.name
    }

    fun copy(): StorageArea = StorageArea(name, sizeX, sizeY, sizeZ)

    override fun hashCode(): Int = Objects.hash(timestamp, frameId, name)
}