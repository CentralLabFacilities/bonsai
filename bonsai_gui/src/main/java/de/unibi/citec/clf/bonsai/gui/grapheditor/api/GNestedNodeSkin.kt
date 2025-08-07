package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.DraggableBox
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNestedNode
import javafx.geometry.Point2D
import javafx.scene.Node

abstract class GNestedNodeSkin(nestedNode: GNestedNode) : GSkin<GNestedNode>(nestedNode) {

    override var root: DraggableBox? = createContainer()

    open fun initialize() {
        item?.let {
            root?.layoutX = item.x
            root?.layoutY = item.y
            root?.resize(item.width, item.height)
        }

    }

    abstract fun setConnectorSkins(connectorSkins: List<GConnectorSkin>)

    abstract fun layoutConnectors()

    abstract fun layoutNodes()

    abstract fun getConnectorPosition(connectorSkin: GConnectorSkin): Point2D

    abstract fun getNodePosition(nodeSkin: GNodeSkin): Point2D

    fun createContainer(): DraggableBox {
        return object: DraggableBox(EditorElement.NESTED_NODE) {
            override fun layoutChildren() {
                super.layoutChildren()
                layoutConnectors()
                layoutNodes()
            }

            override fun positionMoved() {
                super.positionMoved()
                impl_positionMoved()
            }
        }
    }
}