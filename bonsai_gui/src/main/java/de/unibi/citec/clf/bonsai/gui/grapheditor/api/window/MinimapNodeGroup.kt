package de.unibi.citec.clf.bonsai.gui.grapheditor.api.window

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SelectionManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.beans.InvalidationListener
import javafx.beans.WeakInvalidationListener
import javafx.css.*
import javafx.scene.Node
import javafx.scene.Parent
import javafx.scene.canvas.Canvas
import javafx.scene.paint.Color
import java.util.function.Predicate
import kotlin.math.abs
import kotlin.math.round
import kotlin.math.roundToInt

/**
 * The minimap representation of all nodes in the graph editor.
 *
 * <p>
 * This is responsible for drawing mini versions of all nodes in a
 * {@link GModel}. This group of mini-nodes is then displayed inside the
 * {@link GraphEditorMinimap}.
 * </p>
 */
class MinimapNodeGroup : Parent() {

    companion object {
        private val PSEUDO_CLASS_SELECTED = PseudoClass.getPseudoClass("selected")

        fun getClassCssMetaData(): List<CssMetaData<out Styleable?, *>?>? {
            return StyleableProperties.STYLEABLES
        }

        private object StyleableProperties {
            val CONNECTION_COLOR = object : CssMetaData<MinimapNodeGroup, Color>(
                "-connection-color", StyleConverter.getColorConverter(),
                Color.GRAY
            ) {
                override fun isSettable(node: MinimapNodeGroup): Boolean {
                    return !node.connectionColorProperty().isBound
                }

                override fun getStyleableProperty(node: MinimapNodeGroup?): StyleableProperty<Color?>? {
                    return node?.connectionColorProperty()
                }

            }
            val STYLEABLES: List<CssMetaData<out Styleable, *>> by lazy {
                val styleables = Node.getClassCssMetaData().toMutableList()
                styleables.add(CONNECTION_COLOR)
                styleables.toList()
            }
        }

    }

    private val checkSelectionListener = InvalidationListener { checkSelection() }
    private val checkSelectionWeakListener = WeakInvalidationListener(checkSelectionListener)

    var selectionManager: SelectionManager? = null
        set(value) {
            field?.selectedItems?.removeListener(checkSelectionWeakListener)
            field = value
            field?.selectedItems?.addListener(checkSelectionWeakListener)
        }

    var model: GModel? = null

    private val nodes: MutableMap<GNode, Node> = mutableMapOf()

    var minimapRenderer: IMinimapRenderer<*>? = IMinimapRenderer.DefaultMinimapRenderer()
        set(value) {
            field = value
            draw()
        }
    var connectionFilter: Predicate<GConnection>? = Predicate { c -> true }

    private var width: Double = -1.0
    private var height: Double = -1.0
    var scaleFactor: Double = -1.0
        set(value) {
            if (field != value) {
                field = value
                redraw()
            }
        }
    private val canvas: Canvas = Canvas()

    private val _connectionColor = object : StyleableObjectProperty<Color>() {
        override fun getBean(): Any? {
            return "GraphEditorMinimap"
        }

        override fun getName(): String? {
            return "connectionColor"
        }

        override fun getCssMetaData(): CssMetaData<out Styleable, Color> {
            return StyleableProperties.CONNECTION_COLOR
        }
    }

    fun connectionColorProperty(): StyleableObjectProperty<Color> = _connectionColor
    var connectionColor: Color?
        get() = _connectionColor.get()
        set(value) = _connectionColor.set(value)

    init {
        children.add(canvas)
    }

    private fun checkSelection() {
        for (entry in nodes.entries) {
            entry.value.pseudoClassStateChanged(PSEUDO_CLASS_SELECTED, isSelected(entry.key))
        }
    }

    private fun isSelected(node: GNode): Boolean {
        return selectionManager?.isSelected(node) ?: false
    }

    private fun scaleSharp(value: Double, scale: Double): Double {
        return round(value * scale) + 0.5
    }

    override fun isResizable(): Boolean {
        return true
    }

    override fun resize(width: Double, height: Double) {
        if (width != this.width || height != this.height) {
            this.width = width
            this.height = height
            redraw()
        }
    }

    private fun redraw() {
        if (nodes.isEmpty()) draw() else requestLayout()
    }

    /**
     * Draws the model's nodes at a scaled-down size to be displayed in the
     * minimap.
     */
    fun draw() {
        nodes.clear()
        if (children.size > 1) {
            children.remove(1, children.size)
        }
        if (width == -1.0 || height == -1.0 || scaleFactor == -1.0 || minimapRenderer == null) return
        model?.let {
            for (node in it.nodes) {
                minimapRenderer?.createMinimapNode(node)?.let { minimapNode ->
                    children.add(minimapNode)
                    nodes.put(node, minimapNode)
                }
            }
            checkSelection()
        }
        requestLayout()
    }

    override fun layoutChildren() {
        if (width < 1 || height < 1 || minimapRenderer == null) return
        val graphicsContext = canvas.graphicsContext2D
        graphicsContext.clearRect(0.0, 0.0, canvas.width, canvas.height)

        canvas.width = width
        canvas.height = height

        graphicsContext.beginPath()
        graphicsContext.stroke = connectionColor
        graphicsContext.lineWidth = 1.0

        model?.let {
            for (connection in it.connections) {
                if (connection != null) {
                    if (!(connectionFilter?.test(connection) ?: true)) {
                        continue
                    }
                    val source = connection.source
                    val parentSource = source.parent
                    var x = scaleSharp(source.x + (parentSource?.x ?: 0.0) - 10.0, scaleFactor)
                    var y = scaleSharp(source.y + (parentSource?.y ?: 0.0), scaleFactor)
                    graphicsContext.moveTo(x, y)
                    for (j in 0..connection.joints.size) {
                        val newX: Double
                        val newY: Double
                        if (j < connection.joints.size) {
                            val joint = connection.joints[j]
                            newX = scaleSharp(joint.x, scaleFactor)
                            newY = scaleSharp(joint.y, scaleFactor)
                        } else {
                            val target = connection.target
                            val parentTarget = target.parent
                            newX = scaleSharp(target.x + (parentTarget?.x ?: 0.0), scaleFactor)
                            newY = scaleSharp(target.y + (parentTarget?.y ?: 0.0), scaleFactor)
                        }
                        if (abs(newX - x) < abs(newY - y)) graphicsContext.lineTo(x, newY)
                        else graphicsContext.lineTo(newX, y)
                        x = newX
                        y = newY
                    }
                    graphicsContext.stroke()
                }
            }
            for (entry in nodes.entries) {
                resizeRelocate(entry.key, entry.value, minimapRenderer!!)
            }
        }
    }

    private fun <N : Node> resizeRelocate(
        node: GNode,
        rendered: Node?,
        renderer: IMinimapRenderer<N>
    ) {
        val x = (node.x * scaleFactor).roundToInt().toDouble()
        val y = (node.y * scaleFactor).roundToInt().toDouble()
        val width = (node.width * scaleFactor).roundToInt().toDouble()
        val height = (node.height * scaleFactor).roundToInt().toDouble()

        if (rendered != null && renderer.getType().isAssignableFrom(rendered::class.java)) {
            @Suppress("UNCHECKED_CAST")
            renderer.resizeRelocate(rendered as N, x, y, width, height)
        }
    }

    /**
     * @return The CssMetaData associated with this class, which may include the
     *         CssMetaData of its super classes.
     */
    override fun getCssMetaData(): List<CssMetaData<out Styleable?, *>?>? {
        return getClassCssMetaData()
    }
}