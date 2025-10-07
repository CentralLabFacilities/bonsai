package de.unibi.citec.clf.btl.data.vision1d

import de.unibi.citec.clf.btl.Type

class Color(var r: Float, var g : Float, var b : Float, var a : Float = 1.0f) : Type(), Cloneable {

    override fun clone(): Color {
        return Color(r,g,b,a)
    }
    constructor(c: Color) : this(c.r,c.g,c.b,c.a)

    override fun toString(): String {
        return "ColorRGBA: $r, $g, $b, $a"
    }


}