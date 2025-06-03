package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.ConnectionLayouter
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode

interface SkinManager: SkinLookup, GraphEditorSkins {

    var connectionLayouter: ConnectionLayouter?

    fun clear()

    fun removeNode(nodeToRemove: GNode)
    fun removeConnector(connectorToRemove: GConnector)
    fun removeConnection(connectionToRemove: GConnection)
    fun removeJoint(jointToRemove: GJoint)

    fun updateConnectors(node: GNode)
    fun updateJoints(connection: GConnection)

    fun lookupOrCreateNode(node: GNode): GNodeSkin?
    fun lookupOrCreateConnector(connector: GConnector): GConnectorSkin?
    fun lookupOrCreateConnection(connection: GConnection): GConnectionSkin?
    fun lookupOrCreateJoint(joint: GJoint): GJointSkin?

}