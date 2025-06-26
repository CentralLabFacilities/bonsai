package de.unibi.citec.clf.bonsai.gui.grapheditor.utils

import javafx.scene.Group
import javafx.scene.shape.Line

class Arrow : Group() {

    val line: Line = Line()
    val head: ArrowHead = ArrowHead()



    companion object {
        const val STYLE_CLASS_LINE: String = "arrow-line"
        const val STYLE_CLASS_HEAD: String = "arrow-head"
    }
}