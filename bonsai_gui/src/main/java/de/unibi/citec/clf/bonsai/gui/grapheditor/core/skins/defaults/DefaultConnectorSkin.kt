package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorStyle
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connectors.DefaultConnectorTypes
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.utils.AnimatedColor
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.utils.ColorAnimationUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.css.PseudoClass
import javafx.scene.layout.Pane
import javafx.scene.paint.Color
import javafx.scene.shape.Polygon
import javafx.util.Duration
import org.apache.log4j.Logger

class DefaultConnectorSkin(connector: GConnector) : GConnectorSkin(connector) {

    companion object {

        private val LOGGER = Logger.getLogger(DefaultConnectorSkin::class.java)

        private const val STYLE_CLASS_BASE = "default-connector"

        private val PSEUDO_CLASS_ALLOWED = PseudoClass.getPseudoClass("allowed")
        private val PSEUDO_CLASS_FORBIDDEN = PseudoClass.getPseudoClass("forbidden")

        private const val ALLOWED = "-animated-color-allowed"
        private const val FORBIDDEN = "-animated-color-forbidden"

        private const val SIZE = 25.0
        private const val ANIMATION_DUR = 500.0

        fun drawTriangleConnector(type: String, polygon: Polygon) {
            when(type) {
                DefaultConnectorTypes.TOP_INPUT -> drawVertical(false, polygon)
                DefaultConnectorTypes.TOP_OUTPUT -> drawVertical(true, polygon)
                DefaultConnectorTypes.RIGHT_INPUT -> drawHorizontal(false, polygon)
                DefaultConnectorTypes.RIGHT_OUTPUT -> drawHorizontal(true, polygon)
                DefaultConnectorTypes.BOTTOM_INPUT -> drawVertical(true, polygon)
                DefaultConnectorTypes.BOTTOM_OUTPUT -> drawVertical(false, polygon)
                DefaultConnectorTypes.LEFT_INPUT -> drawHorizontal(true, polygon)
                DefaultConnectorTypes.LEFT_OUTPUT -> drawHorizontal(false, polygon)
            }
        }

        private fun drawVertical(pointingUp: Boolean, polygon: Polygon) {
            if (pointingUp) {
                polygon.points.addAll(listOf(SIZE / 2, 0.0, SIZE, SIZE, 0.0, SIZE))
            } else {
                polygon.points.addAll(listOf(0.0, 0.0, SIZE, 0.0, SIZE / 2, SIZE))
            }
        }

        private fun drawHorizontal(pointingRight: Boolean, polygon: Polygon) {
            if (pointingRight) {
                polygon.points.addAll(listOf(0.0, 0.0, SIZE, SIZE/ 2, 0.0, SIZE))
            } else {
                polygon.points.addAll(listOf(SIZE, 0.0, SIZE, SIZE, 0.0, SIZE / 2))
            }
        }

    }

    override val root = Pane()
    private val polygon = Polygon()

    private val animatedColorAllowed: AnimatedColor = AnimatedColor(
            ALLOWED,
            Color.WHITE,
            Color.MEDIUMSEAGREEN,
            Duration.millis(ANIMATION_DUR))
    private val animatedColorForbidden: AnimatedColor = AnimatedColor(
            FORBIDDEN,
            Color.WHITE,
            Color.TOMATO,
            Duration.millis(ANIMATION_DUR))

    init {
        performChecks()

        root.isManaged = false
        root.resize(SIZE, SIZE)
        root.isPickOnBounds = false

        polygon.isManaged = false
        polygon.styleClass.addAll(STYLE_CLASS_BASE, connector.type)

        connector.type?.let {drawTriangleConnector(it, polygon)}

        root.children.add(polygon)
    }

    override fun getWidth(): Double {
        return SIZE
    }

    override fun getHeight(): Double {
        return SIZE
    }

    override fun applyStyle(style: GConnectorStyle) {
        when(style) {
            GConnectorStyle.DEFAULT -> {
                ColorAnimationUtils.removeAnimation(polygon)
                polygon.pseudoClassStateChanged(PSEUDO_CLASS_FORBIDDEN, false)
                polygon.pseudoClassStateChanged(PSEUDO_CLASS_ALLOWED, false)
            }
            GConnectorStyle.DRAG_OVER_ALLOWED -> {
                ColorAnimationUtils.animateColor(polygon, animatedColorAllowed)
                polygon.pseudoClassStateChanged(PSEUDO_CLASS_FORBIDDEN, false)
                polygon.pseudoClassStateChanged(PSEUDO_CLASS_ALLOWED, true)
            }
            GConnectorStyle.DRAG_OVER_FORBIDDEN -> {
                ColorAnimationUtils.animateColor(polygon, animatedColorForbidden)
                polygon.pseudoClassStateChanged(PSEUDO_CLASS_FORBIDDEN, true)
                polygon.pseudoClassStateChanged(PSEUDO_CLASS_ALLOWED, false)
            }
        }
    }

    private fun performChecks() {
        item?.type?.let {
            if (!DefaultConnectorTypes.isValid(it)) {
                LOGGER.error("Connector type '${it}' not recognized, setting to 'left-input'.")
                item.type = DefaultConnectorTypes.LEFT_INPUT
            }
        }
    }

    override fun selectionChanged(isSelected: Boolean) {
        //"Not implemented"
    }

}