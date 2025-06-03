package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.DraggableBox
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.geometry.Point2D


/**
 * The skin class for a {@link GNode}. Responsible for visualizing nodes in the graph editor.
 *
 * <p>
 * A custom node skin must extend this class. It <b>must</b> also provide a constructor taking exactly one {@link GNode}
 * parameter.
 * </p>
 *
 * <p>
 * The node skin is responsible for adding its connectors to the scene graph and laying them out.
 * </p>
 *
 * <p>
 * The root JavaFX node of this skin is a {@link ResizableBox}.
 * </p>
 */
abstract class GNodeSkin(node: GNode) : GSkin<GNode>(node) {

    override var root: DraggableBox? = createContainer()

    /**
     * Initializes the node skin.
     *
     * <p>
     * The skin's layout values, e.g. its x and y position, are loaded from the {@link GNode} at this point.
     * </p>
     */
    open fun initialize() {
        item?.let {
            root?.layoutX = item.x
            root?.layoutY = item.y
            root?.resize(item.width, item.height)
        }

    }

    /**
     * Sets the node's connector skins.
     *
     * <p>
     * This will be called as the node is created, or if a connector is added or removed. The connector skin's regions
     * should be added to the scene graph.
     * </p>
     *
     * @param connectorSkins a list of {@link GConnectorSkin} objects for each of the node's connectors
     */
    abstract fun setConnectorSkins(connectorSkins: List<GConnectorSkin>)

    /**
     * Lays out the node's connectors.
     */
    abstract fun layoutConnectors()

    /**
     * Gets the position of the <b>center</b> of a connector relative to the node region.
     *
     * <p>
     * This will be the point where a connection will attach to.
     * </p>
     *
     * @param connectorSkin a {@link GConnectorSkin} instance
     *
     * @return the x and y coordinates of the connector
     */
    abstract fun getConnectorPosition(connectorSkin: GConnectorSkin): Point2D

    /**
     * Creates and returns the {@link DraggableBox} that serves as the root for
     * this node skin.<br>
     * By default a {@link ResizableBox} will be created and return as most
     * nodes will be both draggable and resizable.
     *
     * @return {@link DraggableBox}
     */
    protected fun createContainer(): DraggableBox {
        return object : DraggableBox(EditorElement.NODE) {
            override fun layoutChildren() {
                super.layoutChildren()
                layoutConnectors()
            }

            override fun positionMoved() {
                super.positionMoved()
                impl_positionMoved()
            }
        }
    }


}