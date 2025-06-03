package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.titled

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorStyle
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.css.PseudoClass
import javafx.scene.Group
import javafx.scene.Node
import javafx.scene.layout.Pane
import javafx.scene.shape.Line

/**
 * A square-shaped connector skin for the 'grey-skins' theme.
 */
class TitledConnectorSkin(connector: GConnector?) : GConnectorSkin(connector!!) {
    override val root = Pane()
    private val forbiddenGraphic: Group

    /**
     * Creates a new [TitledConnectorSkin] instance.
     *
     * @param connector the [GConnector] that this skin is representing
     */
    init {
        root.setMinSize(SIZE, SIZE)
        root.setPrefSize(SIZE, SIZE)
        root.setMaxSize(SIZE, SIZE)
        root.styleClass.setAll(STYLE_CLASS)
        root.isPickOnBounds = false
        forbiddenGraphic = createForbiddenGraphic()
        root.children.addAll(forbiddenGraphic)
    }

    override fun getWidth(): Double {
        return SIZE
    }

    override fun getHeight(): Double {
        return SIZE
    }

    override fun applyStyle(style: GConnectorStyle) {
        when (style) {
            GConnectorStyle.DEFAULT -> {
                root.pseudoClassStateChanged(PSEUDO_CLASS_FORBIDDEN, false)
                root.pseudoClassStateChanged(PSEUDO_CLASS_ALLOWED, false)
                forbiddenGraphic.isVisible = false
            }

            GConnectorStyle.DRAG_OVER_ALLOWED -> {
                root.pseudoClassStateChanged(PSEUDO_CLASS_FORBIDDEN, false)
                root.pseudoClassStateChanged(PSEUDO_CLASS_ALLOWED, true)
                forbiddenGraphic.isVisible = false
            }

            GConnectorStyle.DRAG_OVER_FORBIDDEN -> {
                root.pseudoClassStateChanged(PSEUDO_CLASS_FORBIDDEN, true)
                root.pseudoClassStateChanged(PSEUDO_CLASS_ALLOWED, false)
                forbiddenGraphic.isVisible = true
            }
        }
    }

    override fun selectionChanged(isSelected: Boolean) {
        if (isSelected) {
            root.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, true)
        } else {
            root.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, false)
        }
    }

    /**
     * Creates a graphic to display a 'forbidden' effect in the connector.
     *
     * @return the new graphic
     */
    private fun createForbiddenGraphic(): Group {
        val group = Group()
        val firstLine = Line(1.0, 1.0, SIZE - 1, SIZE - 1)
        val secondLine = Line(1.0, SIZE - 1, SIZE - 1, 1.0)
        firstLine.styleClass.add(STYLE_CLASS_FORBIDDEN_GRAPHIC)
        secondLine.styleClass.add(STYLE_CLASS_FORBIDDEN_GRAPHIC)
        group.children.addAll(firstLine, secondLine)
        group.isVisible = false
        return group
    }

    companion object {
        private const val STYLE_CLASS = "titled-connector" //$NON-NLS-1$
        private const val STYLE_CLASS_FORBIDDEN_GRAPHIC = "titled-connector-forbidden-graphic" //$NON-NLS-1$
        private const val SIZE = 15.0
        private val PSEUDO_CLASS_ALLOWED = PseudoClass.getPseudoClass("allowed") //$NON-NLS-1$
        private val PSEUDO_CLASS_FORBIDDEN = PseudoClass.getPseudoClass("forbidden") //$NON-NLS-1$
        private val PSEUDO_CLASS_SELECTED = PseudoClass.getPseudoClass("selected") //$NON-NLS-1$
    }
}