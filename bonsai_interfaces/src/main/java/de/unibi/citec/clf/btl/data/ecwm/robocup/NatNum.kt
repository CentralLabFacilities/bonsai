package de.unibi.citec.clf.btl.data.ecwm.robocup

import de.unibi.citec.clf.btl.Type
import de.unibi.citec.clf.btl.data.geometry.Pose3D

open class NatNum(val value: Int) : Type(), Cloneable{

    constructor(n: NatNum): this(n.value)

    override fun toString(): String {
        return "NatNum: $value"
    }
}