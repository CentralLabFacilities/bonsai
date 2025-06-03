package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.ConnectionLayouter
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorView
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.collections.FXCollections
import javafx.collections.MapChangeListener
import javafx.collections.ObservableMap
import javafx.util.Callback

class GraphEditorSkinManager(val graphEditor: GraphEditor, val view: GraphEditorView) : SkinManager {

    override var nodeSkinFactory: Callback<GNode, GNodeSkin> = Callback { node: GNode -> DefaultNodeSkin(node) }
    override var connectorSkinFactory: Callback<GConnector, GConnectorSkin> = Callback { connector: GConnector -> DefaultConnectorSkin(connector) }
    override var connectionSkinFactory: Callback<GConnection, GConnectionSkin> = Callback { connection: GConnection -> DefaultConnectionSkin(connection) }
    override var jointSkinFactory: Callback<GJoint, GJointSkin> = Callback { joint: GJoint -> DefaultJointSkin(joint) }
    override var tailSkinFactory: Callback<GConnector, GTailSkin> = Callback { connector: GConnector -> DefaultTailSkin(connector) }

    private val nodeSkins: ObservableMap<GNode, GNodeSkin> = FXCollections.observableHashMap()
    private val connectorSkins = mutableMapOf<GConnector, GConnectorSkin>()
    private val connectionSkins: ObservableMap<GConnection, GConnectionSkin> = FXCollections.observableHashMap()
    private val jointSkins = mutableMapOf<GJoint, GJointSkin>()
    private val tailSkins = mutableMapOf<GConnector, GTailSkin>()

    override var connectionLayouter: ConnectionLayouter? = null
    private val onPositionMoved: (GSkin<*>) -> Unit = this::positionMoved

    /**
    private var onNodeCreated: ((GNode) -> Unit)? = null
    private var onConnectorCreated: ((GConnector) -> Unit)? = null
    private var onConnectionCreated: ((GConnection) -> Unit)? = null
    private var onJointCreated: ((GJoint) -> Unit)? = null
     **/

    init {
        nodeSkins.addListener { change: MapChangeListener.Change<out GNode, out GNodeSkin> ->
            if (change.wasAdded() || change.wasRemoved()) {
                updateConnectors(change.key)
            }
        }
        connectionSkins.addListener { change: MapChangeListener.Change<out GConnection, out GConnectionSkin> ->
            if (change.wasAdded() || change.wasRemoved()) {
                updateJoints(change.key)
            }
        }
    }

    override fun clear() {
        if (nodeSkins.isNotEmpty()) {
            for (node in nodeSkins.keys) {
                removeNode(node)
            }
        }
        if (connectorSkins.isNotEmpty()) {
            for (connector in connectorSkins.keys) {
                removeConnector(connector)
            }
        }
        if (connectionSkins.isNotEmpty()) {
            for (connection in connectionSkins.keys) {
                removeConnection(connection)
            }
        }
        if (jointSkins.isNotEmpty()) {
            for (joint in jointSkins.keys) {
                removeJoint(joint)
            }
        }
        if (tailSkins.isNotEmpty()) {
            for (tail in tailSkins.values) {
                view.remove(tail)
                tail.dispose()
            }
        }
        view.clear()
    }

    override fun removeNode(nodeToRemove: GNode) {
        nodeSkins.remove(nodeToRemove)?.let {
            view.remove(it)
            it.dispose()
        }
        for (connector in nodeToRemove.connectors) {
            removeConnector(connector)
        }
    }

    override fun removeConnector(connectorToRemove: GConnector) {
        connectorSkins.remove(connectorToRemove)?.dispose()
        tailSkins.remove(connectorToRemove)?.dispose()
    }

    override fun removeConnection(connectionToRemove: GConnection) {
        connectionSkins.remove(connectionToRemove)?.let {
            view.remove(it)
            it.dispose()
        }
    }

    override fun removeJoint(jointToRemove: GJoint) {
        jointSkins.remove(jointToRemove)?.let {
            view.remove(it)
            it.dispose()
        }
    }

    override fun updateConnectors(node: GNode) {
        nodeSkins[node]?.let { nodeSkin ->
            val nodeConnectorSkins = node.connectors.mapNotNull { lookupConnector(it) }
            nodeSkin.setConnectorSkins(nodeConnectorSkins)
        }
    }

    override fun updateJoints(connection: GConnection) {
        lookupConnection(connection).let { connectionSkin ->
            val connectionJointSkins = connection.joints.mapNotNull { lookupJoint(it) }
            connectionSkin?.setJointSkins(connectionJointSkins)
        }
    }

    override fun lookupOrCreateNode(node: GNode): GNodeSkin {
        return nodeSkins.computeIfAbsent(node, this::createNodeSkin)
    }

    override fun lookupOrCreateConnector(connector: GConnector): GConnectorSkin {
        return connectorSkins.computeIfAbsent(connector, this::createConnectorSkin)
    }

    override fun lookupOrCreateConnection(connection: GConnection): GConnectionSkin? {
        return connectionSkins.computeIfAbsent(connection, this::createConnectionSkin)
    }

    override fun lookupOrCreateJoint(joint: GJoint): GJointSkin? {
        return jointSkins.computeIfAbsent(joint, this::createJointSkin)
    }

    override fun lookupNode(node: GNode): GNodeSkin? {
        return nodeSkins[node]
    }

    override fun lookupConnector(connector: GConnector): GConnectorSkin? {
        return connectorSkins[connector]
    }

    override fun lookupConnection(connection: GConnection): GConnectionSkin? {
        return connectionSkins[connection]
    }

    override fun lookupJoint(joint: GJoint): GJointSkin? {
        return jointSkins[joint]
    }

    override fun lookupTail(connector: GConnector): GTailSkin {
        return tailSkins.computeIfAbsent(connector, this::createTailSkin)
    }

    private fun createNodeSkin(node: GNode): GNodeSkin {
        val skin: GNodeSkin = nodeSkinFactory.call(node) ?: DefaultNodeSkin(node)
        skin.graphEditor = graphEditor
        skin.root?.editorProperties = graphEditor.editorProperties
        skin.impl_setOnPositionMoved(onPositionMoved)
        skin.initialize()
        if (skin !is VirtualSkin) {
            view.add(skin)
        }
        return skin
    }

    private fun createConnectorSkin(connector: GConnector): GConnectorSkin {
        val skin: GConnectorSkin = connectorSkinFactory.call(connector) ?: DefaultConnectorSkin(connector)
        skin.graphEditor = graphEditor
        return skin
    }

    private fun createConnectionSkin(connection: GConnection): GConnectionSkin {
        val skin: GConnectionSkin = connectionSkinFactory.call(connection) ?: DefaultConnectionSkin(connection)
        skin.graphEditor = graphEditor
        if (skin !is VirtualSkin) {
            view.add(skin)
        }
        return skin
    }

    private fun createJointSkin(joint: GJoint): GJointSkin {
        val skin: GJointSkin = jointSkinFactory.call(joint) ?: DefaultJointSkin(joint)
        skin.graphEditor = graphEditor
        skin.root?.editorProperties = graphEditor.editorProperties
        skin.impl_setOnPositionMoved(onPositionMoved)
        skin.initialize()
        if (skin !is VirtualSkin) {
            view.add(skin)
        }
        return skin
    }

    private fun createTailSkin(connector: GConnector): GTailSkin {
        val skin: GTailSkin = tailSkinFactory.call(connector) ?: DefaultTailSkin(connector)
        skin.graphEditor = graphEditor
        return skin
    }

    private fun positionMoved(movedSkin: GSkin<*>) {
        connectionLayouter?.let {
            if (movedSkin is GNodeSkin || movedSkin is GJointSkin) {
                it.draw()
            }
        }
    }
}