package de.unibi.citec.clf.btl.data.ecwm

import de.unibi.citec.clf.btl.StampedType
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.units.LengthUnit
import java.util.*
import kotlin.math.abs

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

    fun isInside(pose3D: Pose3D): Boolean {
        return abs(pose3D.translation.getX(LengthUnit.METER)) < sizeX &&
                abs(pose3D.translation.getY(LengthUnit.METER)) < sizeY &&
                abs(pose3D.translation.getZ(LengthUnit.METER)) < sizeZ
    }

    fun copy(): StorageArea = StorageArea(name, sizeX, sizeY, sizeZ)

    override fun hashCode(): Int = Objects.hash(timestamp, frameId, name)
}