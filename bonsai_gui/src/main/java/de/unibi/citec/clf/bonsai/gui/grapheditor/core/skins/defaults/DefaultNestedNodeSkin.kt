package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNestedNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GNodeSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNestedNode
import javafx.geometry.Point2D

class DefaultNestedNodeSkin(nestedNode: GNestedNode): GNestedNodeSkin(nestedNode) {
    override fun setConnectorSkins(connectorSkins: List<GConnectorSkin>) {
        TODO("Not yet implemented")
    }

    override fun layoutConnectors() {
        TODO("Not yet implemented")
    }

    override fun layoutNodes() {
        TODO("Not yet implemented")
    }

    override fun getConnectorPosition(connectorSkin: GConnectorSkin): Point2D {
        TODO("Not yet implemented")
    }

    override fun getNodePosition(nodeSkin: GNodeSkin): Point2D {
        TODO("Not yet implemented")
    }

    override fun selectionChanged(isSelected: Boolean) {
        TODO("Not yet implemented")
    }
}