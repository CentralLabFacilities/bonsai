package de.unibi.citec.clf.bonsai.gui.grapheditor.core

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorValidator
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.ConnectionEventManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.ConnectorDragManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.model.DefaultModelEditingManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.model.ModelLayoutUpdater
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.model.ModelSanityChecker
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.selections.DefaultSelectionManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.SkinManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.ConnectionLayouter
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorView
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.impl.DefaultConnectionLayouter
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import javafx.application.Platform
import javafx.beans.InvalidationListener
import javafx.beans.Observable
import javafx.beans.WeakInvalidationListener
import javafx.beans.value.ChangeListener
import javafx.beans.value.ObservableValue
import javafx.collections.ListChangeListener
import org.apache.log4j.Logger

/**
 * The central controller class for the default graph editor implementation.
 *
 * <p>
 * Responsible for using the {@link SkinManager} to create all skin instances for the current {@link GModel}, and adding
 * them to the {@link GraphEditorView view}.
 * </p>
 *
 * <p>
 * Also responsible for creating all secondary managers like the {@link ConnectorDragManager} and reinitializing them
 * when the model changes.
 * </p>
 *
 * <p>
 * The process of synchronizing is rather complicated in case more than one model is part of the resource set:
 * <ol>
 * <li>register listener on every model in the resource set (with an {@link EContentAdapter}</li>
 * <li>receive notifications</li>
 * <li>put notification into queue</li>
 * <li>{@link #process() process queue} on every reload and/or command stack change</li>
 * </ol>
 * This procedure (processing a chunk of notifications on command stack change or {@link GraphEditor#reload()} is a very
 * safe way to determine a valid package of changes.
 * </p>
 *
 * <p>
 * This implementation is thread safe: It is able to process notifications in parallel and processes them in chunks on
 * the FX Thread.
 * </p>
 */
class GraphEditorController<E : GraphEditor>(
    private val editor: E,
    private val skinManager: SkinManager,
    val view: GraphEditorView,
    val connectionEventManager: ConnectionEventManager,
    var properties: GraphEditorProperties?
) {

    val modelEditingManager: ModelEditingManager = DefaultModelEditingManager()
    val connectionLayouter: ConnectionLayouter
    var connectorValidator: GConnectorValidator?
        get() = connectorDragManager.validator
        set(value) {connectorDragManager.validator = value}
    private val modelLayoutUpdater: ModelLayoutUpdater
    private val connectorDragManager: ConnectorDragManager
    val selectionManager: DefaultSelectionManager
    private val modelChangeListener = ChangeListener<GModel> { _, observable, newValue -> modelChanged(observable, newValue)}
    private val nodesChangeListener = ListChangeListener<GNode> { change ->
        while (change.next()) {
            if (change.wasAdded()) {
                for (node in change.addedSubList) {
                    addNode(node)
                }
            }
            if (change.wasRemoved()) {
                for (node in change.removed) {
                    removeNode(node)
                }
            }
        }
    }
    private val connectionsChangeListener = ListChangeListener<GConnection?> { change ->
        while (change.next()) {
            if (change.wasAdded()) {
                for (connection in change.addedSubList) {
                    addConnection(connection)
                }
            }
            if (change.wasRemoved()) {
                for (connection in change.removed) {
                    removeConnection(connection)
                }
            }
        }
    }

    init {
        connectionLayouter = DefaultConnectionLayouter(skinManager)
        modelLayoutUpdater = ModelLayoutUpdater(skinManager, modelEditingManager, properties)
        connectorDragManager = ConnectorDragManager(skinManager, connectionEventManager, view)
        selectionManager = DefaultSelectionManager(skinManager, view)

        initDefaultListeners()

        editor.modelProperty().addListener(modelChangeListener)
        modelChanged(null, editor.model)
    }

    private fun initDefaultListeners() {
        val model = editor.model
        addModelListeners(model)
        for (node in model.nodes) {
            addNode(node)
        }
        for (connection in model.connections) {
            connection?.let {addConnection(connection) }
        }
    }

    private fun addModelListeners(model: GModel) {
        model.nodes.addListener(nodesChangeListener)
        model.connections.addListener(connectionsChangeListener)
    }

    private fun removeModelListeners(model: GModel) {
        model.nodes.removeListener(nodesChangeListener)
        model.connections.removeListener(connectionsChangeListener)
    }

    private fun addConnection(connection: GConnection) {
        addConnectionListeners(connection)
        skinManager.lookupOrCreateConnection(connection)
        selectionManager.addConnection(connection)
        connectionLayouter.draw()
    }

    private fun addConnectionListeners(connection: GConnection) {
        val sourceListener = ChangeListener<GConnector> { _, _, _ -> updateConnection(connection) }
        val targetListener = ChangeListener<GConnector> { _, _, _ -> updateConnection(connection) }
        val typeListener = ChangeListener<String> { _, _, _ -> updateConnection(connection) }
        val bidirectionalListener = ChangeListener<Boolean> { _, _, _, -> updateConnection(connection) }

        val jointsListener = ListChangeListener<GJoint> { change ->
            while (change.next()) {
                if (change.wasAdded()) {
                    for (joint in change.addedSubList) {
                        addJoint(joint)
                    }
                }
                if (change.wasRemoved()) {
                    for (joint in change.removed) {
                        removeJoint(joint)
                    }
                }
            }
        }

        connection.addListeners(sourceListener, targetListener, typeListener, bidirectionalListener, jointsListener)

        for (joint in connection.joints) {
            addJoint(joint)
        }
    }

    private fun addNode(node: GNode) {
        addNodeListeners(node)
        skinManager.lookupOrCreateNode(node)
        modelLayoutUpdater.addNode(node)
        selectionManager.addNode(node)
        markConnectorsDirty(node)
    }

    private fun addNodeListeners(node: GNode) {
        val xListener = ChangeListener<Number> { _, _, _ -> nodePositionChanged(node) }
        val yListener = ChangeListener<Number> { _, _, _ -> nodePositionChanged(node) }
        val widthListener = ChangeListener<Number> { _, _, _ -> nodeSizeChanged(node) }
        val heightListener = ChangeListener<Number> { _, _, _ -> nodeSizeChanged(node) }
        val typeListener = ChangeListener<String> { _, _, _ ->
            removeNode(node)
            addNode(node)
        }
        val connectorsListener = ListChangeListener<GConnector> { change ->
            while (change.next()) {
                if (change.wasAdded()) {
                    for (connector in change.addedSubList) {
                        addConnector(connector)
                    }
                }
                if (change.wasRemoved()) {
                    for (connector in change.removed) {
                        removeConnector(connector)
                    }
                }
            }
            markConnectorsDirty(node)
        }
        node.addListeners(xListener, yListener, widthListener, heightListener, typeListener, connectorsListener)

        for (connector in node.connectors) {
            addConnector(connector)
        }
    }

    private fun markConnectorsDirty(node: GNode) {
        Platform.runLater {
            skinManager.updateConnectors(node)
        }
    }

    private fun modelChanged(oldModel: GModel?, newModel: GModel?) {
        oldModel?.let {
            removeModelListeners(oldModel)
            for (node in oldModel.nodes) {
                removeNode(node)
            }
            for (connection in oldModel.connections) {
                connection?.let {removeConnection(it) }
            }
            skinManager.clear()
        }
        newModel?.let {
            ModelSanityChecker.validate(newModel)
            modelEditingManager.initialize(newModel)
            addModelListeners(newModel)
            for (node in newModel.nodes) {
                addNode(node)
            }
            for (connection in newModel.connections) {
                connection?.let {addConnection(it) }
            }
            selectionManager.initialize(newModel)
            connectionLayouter.initialize(newModel)
            connectorDragManager.initialize(newModel)

            executeOnceWhenPropertyIsNonNull(editor.view.sceneProperty()) { scene ->
                Platform.runLater {
                    updateLayoutValues(newModel)
                }
            }
        }
    }

    private fun updateLayoutValues(model: GModel) {
        if (editor.model != model) return
        val cmd = CompoundCommand()
        Commands.updateLayoutValues(cmd, model, skinManager)
        if (!cmd.commands.isEmpty() && cmd.canExecute()) cmd.execute()
    }

    private fun updateConnection(connection: GConnection) {
        Platform.runLater {
            connectionLayouter.draw()
        }
    }

    private fun addJoint(joint: GJoint) {
        addJointListeners(joint)
        skinManager.lookupOrCreateJoint(joint)
        selectionManager.addJoint(joint)
    }

    private fun addJointListeners(joint: GJoint) {
        val xListener = ChangeListener<Number> { _, _, _ -> jointPositionChanged(joint)}
        val yListener = ChangeListener<Number> { _, _, _ -> jointPositionChanged(joint)}

        joint.addListeners(xListener, yListener)
    }

    private fun removeJoint(joint: GJoint) {
        selectionManager.removeJoint(joint)
        skinManager.removeJoint(joint)
        joint.removeListeners()
    }

    private fun addConnector(connector: GConnector) {
        skinManager.lookupOrCreateConnector(connector)
        connectorDragManager.addConnector(connector)
        selectionManager.addConnector(connector)
    }

    private fun removeConnector(connector: GConnector) {
        selectionManager.removeConnector(connector)
        connectorDragManager.removeConnector(connector)
        skinManager.removeConnector(connector)
    }

    private fun removeConnection(connection: GConnection) {
        selectionManager.removeConnection(connection)
        skinManager.removeConnection(connection)
        for (joint in connection.joints) {
            removeJoint(joint)
        }
        connection.removeListeners()
    }

    private fun removeNode(node: GNode) {
        selectionManager.removeNode(node)
        skinManager.removeNode(node)
        node.removeListeners()
    }

    private fun nodePositionChanged(node: GNode) {
        Platform.runLater {
            skinManager.lookupNode(node)?.root?.relocate(node.x, node.y)
        }
    }

    private fun nodeSizeChanged(node: GNode) {
        Platform.runLater {
            skinManager.lookupNode(node)?.root?.resize(node.width, node.height)
        }
    }

    private fun jointPositionChanged(joint: GJoint) {
        Platform.runLater {
            skinManager.lookupJoint(joint)?.initialize()
        }
    }

    companion object {
        private val LOGGER = Logger.getLogger(GraphEditorController::class.java)

        fun <T> executeOnceWhenPropertyIsNonNull(
            property: ObservableValue<T>?,
            consumer: (T) -> Unit
        ) {
            if (property == null) return

            val value = property.value
            if (value != null) {
                consumer(value)
            } else {
                val listener = object : InvalidationListener {
                    override fun invalidated(observable: Observable) {
                        val newValue = property.value
                        if (newValue != null) {
                            property.removeListener(this)
                            consumer(newValue)
                        }
                    }
                }
                property.addListener(WeakInvalidationListener(listener))
            }
        }
    }






}