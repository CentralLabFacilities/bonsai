package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorStyle
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.css.PseudoClass
import javafx.scene.Node
import javafx.scene.layout.Pane
import javafx.scene.shape.Circle

/**
 * Connector skin for the 'tree-like' graph.
 */
class TreeConnectorSkin(connector: GConnector) : GConnectorSkin(connector) {
    override val root = Pane()
    private val circle = Circle(RADIUS)

    /**
     * Creates a new [TreeConnectorSkin] instance.
     *
     * @param connector the [GConnector] that this skin is representing
     */
    init {
        root.setMinSize(2 * RADIUS, 2 * RADIUS)
        root.setPrefSize(2 * RADIUS, 2 * RADIUS)
        root.setMaxSize(2 * RADIUS, 2 * RADIUS)
        root.isPickOnBounds = false
        circle.isManaged = false
        circle.resizeRelocate(0.0, 0.0, 2 * RADIUS, 2 * RADIUS)
        if (TreeSkinConstants.TREE_INPUT_CONNECTOR.equals(connector.type)) {
            circle.styleClass.setAll(STYLE_CLASS_INPUT)
        } else {
            circle.styleClass.setAll(STYLE_CLASS_OUTPUT)
        }
        root.children.add(circle)
    }

    override fun selectionChanged(isSelected: Boolean) {
        // Not implemented
    }

    override fun getWidth(): Double {
        return 2 * RADIUS
    }

    override fun getHeight(): Double {
        return 2 * RADIUS
    }

    override fun applyStyle(style: GConnectorStyle) {
        when (style) {
            GConnectorStyle.DEFAULT -> {
                circle.pseudoClassStateChanged(PSEUDO_CLASS_FORBIDDEN, false)
                circle.pseudoClassStateChanged(PSEUDO_CLASS_ALLOWED, false)
            }

            GConnectorStyle.DRAG_OVER_ALLOWED -> {
                circle.pseudoClassStateChanged(PSEUDO_CLASS_FORBIDDEN, false)
                circle.pseudoClassStateChanged(PSEUDO_CLASS_ALLOWED, true)
            }

            GConnectorStyle.DRAG_OVER_FORBIDDEN -> {
                circle.pseudoClassStateChanged(PSEUDO_CLASS_FORBIDDEN, true)
                circle.pseudoClassStateChanged(PSEUDO_CLASS_ALLOWED, false)
            }
        }
    }

    companion object {
        private const val STYLE_CLASS_INPUT = "tree-input-connector" //$NON-NLS-1$
        private const val STYLE_CLASS_OUTPUT = "tree-output-connector" //$NON-NLS-1$
        private val PSEUDO_CLASS_ALLOWED = PseudoClass.getPseudoClass("allowed") //$NON-NLS-1$
        private val PSEUDO_CLASS_FORBIDDEN = PseudoClass.getPseudoClass("forbidden") //$NON-NLS-1$
        private const val RADIUS = 8.0
    }
}