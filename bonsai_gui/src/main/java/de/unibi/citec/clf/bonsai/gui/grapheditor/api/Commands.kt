package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.*
import javafx.geometry.Point2D
import org.apache.log4j.Logger

/**
 * Provides utility methods for editing a {@link GModel}
 *
 * <p>
 * Example:
 *
 * <pre>
 * <code>val model: GModel = GModel()
 * val node GNode = GNode()
 *
 * node.x = 100.0
 * node.y = 50.0
 * node.width = 150.0
 * node.height = 200.0
 *
 * Commands.addNode(model, node)
 * Commands.undo(model)
 * Commands.redo(model)</code>
 * </pre>
 */
object Commands {

    private val LOGGER: Logger = Logger.getLogger(Commands::class.java)

    /**
     * Adds a node to the model.
     *
     * <p>
     * The node's x, y, width, and height values should be set before calling this method.
     * </p>
     *
     * @param model
     *          the {@link GModel} to which the node should be added
     * @param node
     *          the {@link GNode} to add to the model
     */
    fun addNode(model: GModel, node: GNode) {
        val command = AddCommand.create(model, { owner -> model.nodes }, node)
        if (command.canExecute()) CommandStack.getCommandStack(model).execute(command)
    }

    /**
     * Removes a node from the model.
     *
     * <p>
     * Also removes any connections that were attached to the node.
     * </p>
     *
     * @param model
     *          the {@link GModel} from which the node should be removed
     * @param node
     *          the {@link GNode} to remove from the model
     */
    fun removeNode(model: GModel, node: GNode) {
        val command = CompoundCommand()
        command.append(RemoveCommand.create(model, { owner -> model.nodes }, node))
        val connectionsToDelete: MutableList<GConnection> = mutableListOf()
        for (connector in node.connectors) {
            for (connection in connector.connections) {
                if (connection != null && !connectionsToDelete.contains(connection)) {
                    connectionsToDelete.add(connection)
                }
            }
        }
        for (connection in connectionsToDelete) {
            command.append(RemoveCommand.create(model, { owner -> model.connections }, connection))

            val source = connection.source
            val target = connection.target

            if (node != source?.parent) {
                command.append(RemoveCommand.create(source, { (it as GConnector).connections }, connection))
            }
            if (node != target?.parent) {
                command.append(RemoveCommand.create(target, { (it as GConnector).connections }, connection))
            }
        }
        if (command.canExecute()) {
            CommandStack.getCommandStack(model).execute(command)
        }
    }

    /**
     * Clears everything in the given model.
     *
     * @param model
     *          the {@link GModel} to be cleared
     */
    fun clear(model: GModel) {
        println("Model vorm Löschen: $model")
        val command = CompoundCommand()
        val existingConnections = model.connections.toList()
        for (connection in existingConnections) {
            command.append(RemoveCommand.create(model, { owner -> model.connections }, connection))
        }
        val existingNodes = model.nodes.toList()
        for (node in existingNodes) {
            command.append(RemoveCommand.create(model, { owner -> model.nodes }, node))
        }
        if (command.canExecute()) {
            println("Löschen ausführen...")
            println(CommandStack.getCommandStack(model))
            CommandStack.getCommandStack(model).execute(command)
        }
        println("Model nachm Löschen: $model")
    }

    /**
     * Removes all connectors from the given nodes, and all connections attached to them.
     *
     * @param model
     *          the {@link GModel} being edited
     * @param nodes
     *          a list of {@link GNode} instances whose connectors should be removed
     */
    fun clearConnectors(model: GModel, nodes: List<GNode>) {
        val command = CompoundCommand()
        val connectionsToRemove: MutableSet<GConnection> = mutableSetOf()
        val connectorsToRemove: MutableSet<GConnector> = mutableSetOf()
        val existingNodes = nodes.toList()
        for (node in existingNodes) {
            val existingConnectors = node.connectors.toList()
            for (connector in existingConnectors) {
                command.append(RemoveCommand.create(node, { (it as GNode).connectors }, connector))
            }
            connectorsToRemove.addAll(node.connectors)
            for (connector in node.connectors) {
                connectionsToRemove.addAll(connector.connections)
            }
        }
        for (connection in connectionsToRemove) {
            val source = connection.source
            val target = connection.target
            if (!connectorsToRemove.contains(source)) {
                command.append(RemoveCommand.create(source, { (it as GConnector).connections }, connection))
            }
            if (!connectorsToRemove.contains(target)) {
                command.append(RemoveCommand.create(target, { (it as GConnector).connections }, connection))
            }
            command.append(RemoveCommand.create(model, { owner -> model.connections }, connection))
        }
        if (command.canExecute()) {
            CommandStack.getCommandStack(model).execute(command)
        }
    }

    /**
     * Updates the model's layout values to match those in the skin instances.
     *
     * <p>
     * This method adds set operations to the given compound command but does <b>not</b> execute it.
     * </p>
     *
     * @param command
     *          a {@link CompoundCommand} to which the set commands will be added
     * @param model
     *          the {@link GModel} whose layout values should be updated
     * @param skinLookup
     *          the {@link SkinLookup} in use for this graph editor instance
     */
    fun updateLayoutValues(command: CompoundCommand, model: GModel, skinLookup: SkinLookup) {
        for (node in model.nodes) {
            skinLookup.lookupNode(node)?.let {
                if (checkNodeChanged(node, it)) {
                    val nodeRegion = it.root
                    command.append(SetPropertyCommand.create(node.xProperty(), nodeRegion?.layoutX))
                    command.append(SetPropertyCommand.create(node.yProperty(), nodeRegion?.layoutY))
                    command.append(SetPropertyCommand.create(node.widthProperty(), nodeRegion?.width))
                    command.append(SetPropertyCommand.create(node.heightProperty(), nodeRegion?.height))
                }
            }
        }
        for (connection in model.connections) {
            connection?.source?.let { updateConnector(it, command, skinLookup) }
            connection?.target?.let { updateConnector(it, command, skinLookup) }
            connection?.let { connection ->
                for (joint in connection.joints) {
                    skinLookup.lookupJoint(joint)?.let {
                        if (checkJointChanged(joint, it)) {
                            val jointRegion = it.root
                            val x = (jointRegion?.layoutX ?: 0.0) + it.width / 2
                            val y = (jointRegion?.layoutY ?: 0.0) + it.height / 2
                            command.append(SetPropertyCommand.create(joint.xProperty(), x))
                            command.append(SetPropertyCommand.create(joint.yProperty(), y))
                        }
                    }
                }
            }
        }
    }

    private fun updateConnector(connector: GConnector, command: CompoundCommand, skinLookup: SkinLookup) {
        skinLookup.lookupConnector(connector)?.let { connectorSkin ->
            skinLookup.lookupNode(connector.parent!!)?.let { nodeSkin ->
                val connectorPosition = nodeSkin.getConnectorPosition(connectorSkin)
                if (checkConnectorChanged(connector, connectorPosition)) {
                    command.append(SetPropertyCommand.create(connector.xProperty(), connectorPosition.x))
                    command.append(SetPropertyCommand.create(connector.yProperty(), connectorPosition.y))
                }
            }
        }
    }

    /**
     * Checks if a connector's JavaFX region has different layout values than those currently stored in the model.
     *
     * @param connector
     *          the model instance for the connector
     *
     * @return {@code true} if any layout value has changed, {@code false if not}
     */
    private fun checkConnectorChanged(connector: GConnector, connectorPosition: Point2D): Boolean {
        return if (connectorPosition.x != connector.x) true
        else if (connectorPosition.y != connector.y) true
        else false
    }

    /**
     * Checks if a node's JavaFX region has different layout values than those currently stored in the model.
     *
     * @param node
     *          the model instance for the node
     *
     * @return {@code true} if any layout value has changed, {@code false if not}
     */
    private fun checkNodeChanged(node: GNode, nodeSkin: GNodeSkin): Boolean {
        val nodeRegion = nodeSkin.root
        return when {
            nodeRegion?.layoutX != node.x -> true
            nodeRegion.layoutY != node.y -> true
            nodeRegion.width != node.width -> true
            nodeRegion.height != node.height -> true
            else -> false
        }
    }

    /**
     * Checks if a joint's JavaFX region has different layout values than those currently stored in the model.
     *
     * @param joint
     *          the model instance for the joint
     *
     * @return {@code true} if any layout value has changed, {@code false if not}
     */
    private fun checkJointChanged(joint: GJoint, jointSkin: GJointSkin): Boolean {
        val jointRegion = jointSkin.root
        val jointRegionX = (jointRegion?.layoutX ?: 0.0) + jointSkin.width / 2
        val jointRegionY = (jointRegion?.layoutY ?: 0.0) + jointSkin.height / 2
        return if (jointRegionX != joint.x) true
        else if (jointRegionY != joint.y) true
        else false
    }

    /**
     * Attempts to undo the given model to its previous state.
     *
     * @param model
     *          the {@link GModel} to undo
     */
    fun undo(model: GModel) {
        if (CommandStack.getCommandStack(model).canUndo) CommandStack.getCommandStack(model).undo()
    }

    /**
     * Attempts to redo the given model to its next state.
     *
     * @param model
     *          the {@link GModel} to redo
     */
    fun redo(model: GModel) {
        if (CommandStack.getCommandStack(model).canRedo) CommandStack.getCommandStack(model).redo()
    }
}