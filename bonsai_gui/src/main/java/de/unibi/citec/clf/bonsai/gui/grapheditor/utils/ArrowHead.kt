package de.unibi.citec.clf.bonsai.gui.grapheditor.utils

import javafx.scene.shape.Path
import javafx.scene.paint.Color
import javafx.scene.shape.StrokeType
import javafx.scene.transform.Rotate

class ArrowHead: Path() {

    private var x: Double = 0.0
    private var y: Double = 0.0
    private var length: Double = DEFAULT_LENGTH
    private var width: Double = DEFAULT_WIDTH
    private var radius: Double = -1.0

    private val rotate: Rotate = Rotate()

    init {
        fill = Color.BLACK
        strokeType = StrokeType.INSIDE
        transforms.add(rotate)
    }

    fun setCenter(x: Double, y: Double) {

    }


    companion object {
        const val DEFAULT_LENGTH: Double = 10.0
        const val DEFAULT_WIDTH: Double = 10.0
    }
}