package de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils

import javafx.scene.shape.Path
import javafx.scene.paint.Color
import javafx.scene.shape.ArcTo
import javafx.scene.shape.ClosePath
import javafx.scene.shape.LineTo
import javafx.scene.shape.MoveTo
import javafx.scene.shape.StrokeType
import javafx.scene.transform.Rotate

/**
 * An arrow-head shape.
 *
 * <p>
 * This is used by the {@link Arrow} class.
 * </p>
 */
class ArrowHead : Path() {

    private var x = 0.0
    private var y = 0.0
    var length = DEFAULT_LENGTH
    var width = DEFAULT_WIDTH
    var radius = -1.0

    val rotate = Rotate()

    init {
        fill = Color.BLACK
        strokeType = StrokeType.INSIDE
        transforms.add(rotate)
    }

    fun setCenter(x: Double, y: Double) {
        this.x = x
        this.y = y
        rotate.pivotX = x
        rotate.pivotY = y
    }

    fun draw() {
        elements.clear()

        elements.add(MoveTo(x, y + length / 2))
        elements.add(LineTo(x + width / 2, y - length / 2))

        if (radius > 0) {
            val arcTo = ArcTo()
            arcTo.let {
                it.x = this.x - width / 2
                it.y = this.y - length / 2
                it.radiusX = radius
                it.radiusY = radius
                it.isSweepFlag = true
            }
            elements.add(arcTo)
        } else {
            elements.add(LineTo(x - width / 2, y - length / 2))
        }
        elements.add(ClosePath())
    }


    companion object {
        const val DEFAULT_LENGTH = 10.0
        const val DEFAULT_WIDTH = 10.0
    }
}