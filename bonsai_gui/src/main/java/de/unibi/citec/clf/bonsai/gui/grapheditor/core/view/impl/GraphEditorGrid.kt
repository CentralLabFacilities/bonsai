package de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.impl

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import javafx.beans.property.DoublePropertyBase
import javafx.css.CssMetaData
import javafx.css.StyleConverter
import javafx.css.Styleable
import javafx.css.StyleableObjectProperty
import javafx.css.StyleableProperty
import javafx.scene.Node
import javafx.scene.layout.Region
import javafx.scene.paint.Color
import javafx.scene.shape.LineTo
import javafx.scene.shape.MoveTo
import javafx.scene.shape.Path
import kotlin.math.floor

class GraphEditorGrid: Region() {

    companion object {
        private const val HALF_PIXEL_OFFSET = -0.5
        private const val STYLE_CLASS = "graph-editor-grid"
        private const val GRID_COLOR_SELECTOR = "-grid-color"
        private const val GRID_COLOR_PROPERTY_NAME = "gridColor"
        private val DEFAULT_GRID_COLOR = Color.rgb(222, 248, 255)
    }

    private var lastWidth: Double = -1.0
    private var lastHeight: Double = -1.0
    private val grid: Path = Path()
    private val gridColor = object : StyleableObjectProperty<Color>(DEFAULT_GRID_COLOR) {
        override fun getBean(): Any? {
            return this@GraphEditorGrid
        }

        override fun getName(): String? {
            return GRID_COLOR_PROPERTY_NAME
        }

        override fun getCssMetaData(): CssMetaData<out Styleable, Color> {
            return StyleableProperties.GRID_COLOR
        }

        override fun invalidated() {
            requestLayout()
        }
    }

    private val _gridSpacing = object : DoublePropertyBase(GraphEditorProperties.DEFAULT_GRID_SPACING) {
        override fun getBean(): Any? {
            return this@GraphEditorGrid
        }

        override fun getName(): String? {
            return "gridSpacing"
        }

        override fun invalidated() {
            draw(width, height)
        }
    }
    var gridSpacing: Double
        get() = _gridSpacing.get()
        set(value) = _gridSpacing.set(value)
    fun gridSpacingProperty() = _gridSpacing

    init {
        isManaged = false
        isMouseTransparent = true
        styleClass.add(STYLE_CLASS)
        grid.strokeProperty().bind(gridColor)
        children.add(grid)
    }

    override fun resize(width: Double, height: Double) {
        super.resize(width, height)
        if (lastHeight != height || lastWidth != width) {
            lastHeight = height
            lastWidth = width
            draw(width, height)
        }
    }

    fun draw(width: Double, height: Double) {
        val hLineCount: Int = floor((height + 1) / gridSpacing).toInt()
        val vLineCount: Int = floor((width + 1) / gridSpacing).toInt()

        for (num in 0..<hLineCount) {
            val y: Double = (num + 1) * gridSpacing + HALF_PIXEL_OFFSET
            grid.elements.add(MoveTo(0.0, y))
            grid.elements.add(LineTo(width, y))
        }

        for (num in 0..<vLineCount) {
            val x: Double = (num + 1) * gridSpacing + HALF_PIXEL_OFFSET
            grid.elements.add(MoveTo(x, 0.0))
            grid.elements.add(LineTo(x, height))
        }
    }

    //fun getGridSpacing() FIXME

    override fun getCssMetaData(): List<CssMetaData<out Styleable?, *>?>? {
        return StyleableProperties.STYLEABLES
    }

    private object StyleableProperties {

        val GRID_COLOR: CssMetaData<GraphEditorGrid, Color> =
            object : CssMetaData<GraphEditorGrid, Color>(GRID_COLOR_SELECTOR, StyleConverter.getColorConverter()) {

                override fun isSettable(node: GraphEditorGrid): Boolean {
                    return !node.gridColor.isBound
                }

                override fun getStyleableProperty(node: GraphEditorGrid): StyleableProperty<Color> {
                    return node.gridColor
                }
            }

        val STYLEABLES: List<CssMetaData<out Styleable, *>> = listOf(
            *Node.getClassCssMetaData().toTypedArray(),
            GRID_COLOR
        )
    }

}