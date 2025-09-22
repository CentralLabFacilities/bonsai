package de.unibi.citec.clf.btl.data.world

import de.unibi.citec.clf.btl.Type

open class Model(val typeName: String) : Type(), Cloneable{

    override fun clone(): Model {
        return Model(typeName)
    }
    constructor(m: Model) : this(m.typeName)

    override fun toString(): String {
        return "Model: $typeName"
    }
}