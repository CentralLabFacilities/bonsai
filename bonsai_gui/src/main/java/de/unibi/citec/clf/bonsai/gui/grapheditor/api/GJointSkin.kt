package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.DraggableBox
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint

/**
 * The skin class for a {@link GJoint}. Responsible for visualizing joints in the graph editor.
 *
 * <p>
 * A custom joint skin must extend this class. It <b>must</b> also provide a constructor taking exactly one
 * {@link GJoint} parameter.
 * </p>
 *
 * <p>
 * The root JavaFX node of this skin is a {@link DraggableBox}.
 * </p>
 */
abstract class GJointSkin(joint: GJoint): GSkin<GJoint>(joint) {

    abstract var width: Double
    abstract var height: Double

    /**
     * Root JavaFX node of the skin.
     */
    override val root: DraggableBox? = object: DraggableBox(EditorElement.JOINT) {
        override fun positionMoved() {
            super.positionMoved()
            impl_positionMoved()
        }
    }

    /**
     * Initializes the joint skin.
     *
     * <p>
     * The skin's layout values are loaded from the {@link GJoint} at this point.
     * </p>
     */
    fun initialize() {
        item?.let {
            root?.layoutX = item.x - width / 2
            root?.layoutY = item.y - height / 2
        }
    }
}