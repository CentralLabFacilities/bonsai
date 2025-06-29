package de.unibi.citec.clf.bonsai.gui.grapheditor

import de.unibi.citec.clf.bonsai.gui.grapheditor.utils.DraggableBox

abstract class GJointSkin(joint: GJoint): GSkin<GJoint> {

    init {
        super(joint)
    }

    private val root = object: DraggableBox(BonsaiEditorElement.JOINT) {
        override fun positionMoved() {
            super.positionMoved()
            GJointSkin.this.impl_positionMoved()
        }
    }
}