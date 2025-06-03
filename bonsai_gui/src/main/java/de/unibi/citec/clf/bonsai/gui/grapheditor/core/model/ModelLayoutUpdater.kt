package de.unibi.citec.clf.bonsai.gui.grapheditor.core.model

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.EditorElement
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.ModelEditingManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.event.EventHandler
import javafx.scene.input.MouseEvent

/**
 * Responsible for updating the {@link GModel}'s layout values at the end of
 * each mouse gesture.
 */
class ModelLayoutUpdater(
    private val skinLookup: SkinLookup,
    private val modelEditingManager: ModelEditingManager,
    private val properties: GraphEditorProperties?
) {

    private val mouseReleasedHandlerNode = EventHandler<MouseEvent> { event ->
        elementMouseReleased(EditorElement.NODE)
    }
    private val mouseReleasedHandlerJoint = EventHandler<MouseEvent> { event ->
        elementMouseReleased(EditorElement.JOINT)
    }

    /**
     * Adds a handler to update the model when a node's layout properties
     * change.
     *
     * @param node
     *            the {@link GNode} whose values should be updated
     */
    fun addNode(node: GNode) {
        skinLookup.lookupNode(node)?.let {
            it.root?.addEventHandler(MouseEvent.MOUSE_RELEASED, mouseReleasedHandlerNode)
        }
    }

    /**
     * Removes a handler which updated the model when a node's layout properties
     * changed.
     *
     * @param node
     *            the {@link GNode} whose values were updated
     */
    fun removeNode(node: GNode) {
        skinLookup.lookupNode(node)?.let {
            it.root?.removeEventHandler(MouseEvent.MOUSE_RELEASED, mouseReleasedHandlerNode)
        }
    }

    /**
     * Adds a handler to update the model when a joint's layout properties
     * change.
     *
     * @param joint
     *            the {@link GJoint} whose values should be updated
     */
    fun addJoint(joint: GJoint) {
        skinLookup.lookupJoint(joint)?.let {
            it.root?.addEventHandler(MouseEvent.MOUSE_RELEASED, mouseReleasedHandlerJoint)
        }
    }

    fun removeJoint(joint: GJoint) {
        skinLookup.lookupJoint(joint)?.let {
            it.root?.removeEventHandler(MouseEvent.MOUSE_RELEASED, mouseReleasedHandlerJoint)
        }
    }

    private fun elementMouseReleased(type: EditorElement) {
        if (canEdit(type)) {
            modelEditingManager.updateLayoutValues(skinLookup)
        }
    }

    private fun canEdit(type: EditorElement): Boolean {
        return properties != null && !properties.isReadOnly(type)
    }





}