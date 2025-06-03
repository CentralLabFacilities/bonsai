package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GJointSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import javafx.css.PseudoClass
import javafx.geometry.Point2D

class DefaultJointSkin(joint: GJoint): GJointSkin(joint) {

    companion object {

        private const val STYLE_CLASS = "default-joint"

        private val PSEUDO_CLASS_SELECTED = PseudoClass.getPseudoClass("selected")

        private const val SIZE = 12.0
        private val SNAP_OFFSET = Point2D(-5.0, -5.0)
    }

    override var width = SIZE
    override var height = SIZE

    init {
        root?.resize(SIZE, SIZE)
        root?.styleClass?.setAll(STYLE_CLASS)
        root?.isPickOnBounds = false
        root?.snapToGridOffset = SNAP_OFFSET
    }

    override fun selectionChanged(isSelected: Boolean) {
        root?.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, selected)
        if (selected) {
            root?.toFront()
        }
    }

}