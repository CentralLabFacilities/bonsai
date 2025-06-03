package de.unibi.citec.clf.bonsai.gui.grapheditor.api.window

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.scene.Node
import javafx.scene.shape.Rectangle


/**
 * Interface for rendering {@link GNode} objects as {@link Node}.
 *
 * @param <N>
 *         type of {@link Node} to render a {@link GNode} in the minimap
 */
interface IMinimapRenderer <N: Node> {

    /**
     * create a minimap representation for the given {@link GNode}
     *
     * @param node
     *         {@link GNode}
     * @return node
     */
    fun createMinimapNode(node: GNode): N

    /**
     * @return type
     */
    fun getType(): Class<N>

    /**
     * set the layout bounds of a minimap node to the specified pWidth and pHeight.
     *
     * @param node
     *         node
     * @param x
     *         the target pX coordinate location
     * @param y
     *         the target pY coordinate location
     * @param width
     *         the target layout bounds pWidth
     * @param height
     *         the target layout bounds pHeight
     */
    fun resizeRelocate(node: N, x: Double, y: Double, width: Double, height: Double)

    class DefaultMinimapRenderer() : IMinimapRenderer<Rectangle> {
        /**
         * style class
         */
        companion object {
            private const val STYLE_CLASS_NODE = "minimap-node"
        }

        override fun getType(): Class<Rectangle> {
            return Rectangle::class.java
        }

        override fun createMinimapNode(node: GNode): Rectangle {
            val minimapNode = Rectangle()
            minimapNode.styleClass.addAll(STYLE_CLASS_NODE, node.type)
            return minimapNode
        }

        override fun resizeRelocate(node: Rectangle, x: Double, y: Double, width: Double, height: Double) {
            node.x = x
            node.y = y
            node.width = width
            node.height = height
        }

    }
}