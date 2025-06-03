package de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEventManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphInputGesture
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.utils.ConnectionCommands
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.utils.EventUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorView
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import javafx.event.Event
import javafx.event.EventHandler
import javafx.event.EventType
import javafx.geometry.Point2D
import javafx.scene.Node
import javafx.scene.input.MouseButton
import javafx.scene.input.MouseDragEvent
import javafx.scene.input.MouseEvent

/**
 * Responsible for what happens when connectors are dragged in the graph editor.
 *
 * <p>
 * Namely, the creation, removal, and repositioning of connections.
 * </p>
 */
class ConnectorDragManager(val skinLookup: SkinLookup, val connectionEventManager: ConnectionEventManager, val view: GraphEditorView) {

    private var tailManager: TailManager = TailManager(skinLookup, view)
    private lateinit var model: GModel

    private val mouseExitedHandler: (MouseEvent) -> Unit = this::handleMouseExited
    private val mousePressedHandler: (Event) -> Unit = Event::consume

    private val mouseEnteredHandlers: MutableMap<Node, EventHandler<MouseEvent>> = mutableMapOf()
    private val mouseReleasedHandlers: MutableMap<Node, EventHandler<MouseEvent>> = mutableMapOf()
    private val dragDetectedHandlers: MutableMap<Node, EventHandler<MouseEvent>> = mutableMapOf()
    private val mouseDraggedHandlers: MutableMap<Node, EventHandler<MouseEvent>> = mutableMapOf()
    private val mouseDragEnteredHandlers: MutableMap<Node, EventHandler<MouseDragEvent>> = mutableMapOf()
    private val mouseDragExitedHandlers: MutableMap<Node, EventHandler<MouseDragEvent>> = mutableMapOf()
    private val mouseDragReleasedHandlers: MutableMap<Node, EventHandler<MouseDragEvent>> = mutableMapOf()

    var validator: GConnectorValidator? = DefaultConnectorValidator()
        set(value) {
            field = value?.let { value } ?: DefaultConnectorValidator()
        }

    private var hoveredConnector: GConnector? = null
    private var sourceConnector: GConnector? = null
    private var targetConnector: GConnector? = null
    private var removalConnector: GConnector? = null

    private var repositionAllowed: Boolean = true

    /**
     * Initializes the drag manager for the given model.
     *
     * @param model
     *            the {@link GModel} currently being edited
     */
    fun initialize(model: GModel) {
        this.model = model
        clearTrackingParameters()
        setHandlers()
    }

    /**
     * Clears all parameters that track things like what connector is currently
     * hovered over, and so on.
     */
    fun clearTrackingParameters() {
        tailManager.cleanUp()
        hoveredConnector = null
        removalConnector = null
        repositionAllowed = true
    }

    fun addConnector(connector: GConnector) {
        addMouseHandlers(connector)
    }

    fun removeConnector(connectorToRemove: GConnector) {
        val connectorSkin: GConnectorSkin? = skinLookup.lookupConnector(connectorToRemove)
        connectorSkin?.let {
            val root: Node? = connectorSkin.root
            root.let {
                removeSingleEventHandler(root, mouseEnteredHandlers, MouseEvent.MOUSE_ENTERED)
                removeSingleEventHandler(root, mouseReleasedHandlers, MouseEvent.MOUSE_RELEASED)
                removeSingleEventHandler(root, dragDetectedHandlers, MouseEvent.DRAG_DETECTED)
                removeSingleEventHandler(root, mouseDraggedHandlers, MouseEvent.MOUSE_DRAGGED)
                removeSingleEventHandler(root, mouseDragEnteredHandlers, MouseDragEvent.MOUSE_DRAG_ENTERED)
                removeSingleEventHandler(root, mouseDragExitedHandlers, MouseDragEvent.MOUSE_DRAG_EXITED)
                removeSingleEventHandler(root, mouseDragReleasedHandlers, MouseDragEvent.MOUSE_DRAG_RELEASED)
                removeGeneralEventHandlers(root)
            }
        }
        if (sourceConnector == connectorToRemove || targetConnector == connectorToRemove || removalConnector == connectorToRemove) {
            clearTrackingParameters()
        }
    }

    private fun removeGeneralEventHandlers(node: Node?) {
        node?.removeEventHandler(MouseEvent.MOUSE_PRESSED, mousePressedHandler)
        node?.removeEventHandler(MouseEvent.MOUSE_EXITED, mouseExitedHandler)
    }

    /**
     * Sets all mouse and mouse-drag handlers for all connectors in the current
     * model.
     */
    private fun setHandlers() {
        for (node in mouseEnteredHandlers.keys) {
            removeGeneralEventHandlers(node)
        }
        EventUtils.removeEventHandlers(mouseEnteredHandlers, MouseEvent.MOUSE_ENTERED)
        EventUtils.removeEventHandlers(mouseReleasedHandlers, MouseEvent.MOUSE_RELEASED)
        EventUtils.removeEventHandlers(dragDetectedHandlers, MouseEvent.DRAG_DETECTED)
        EventUtils.removeEventHandlers(mouseDraggedHandlers, MouseEvent.MOUSE_DRAGGED)
        EventUtils.removeEventHandlers(mouseDragEnteredHandlers, MouseDragEvent.MOUSE_DRAG_ENTERED)
        EventUtils.removeEventHandlers(mouseDragExitedHandlers, MouseDragEvent.MOUSE_DRAG_EXITED)
        EventUtils.removeEventHandlers(mouseDragReleasedHandlers, MouseDragEvent.MOUSE_DRAG_RELEASED)
        for (node in model.nodes) {
            for (connector in node.connectors) {
                addMouseHandlers(connector)
            }
        }
    }

    /**
     * Adds mouse handlers to a particular connector.
     *
     * @param connector
     *            the {@link GConnector} to which mouse handlers should be added
     */
    private fun addMouseHandlers(connector: GConnector) {
        val connectorSkin: GConnectorSkin? = skinLookup.lookupConnector(connector)
        connectorSkin?.let {
            val root: Node? = skinLookup.lookupConnector(connector)?.root
            if (root == null || mouseEnteredHandlers.containsKey(root)) return
            val newMouseEnteredHandler = EventHandler<MouseEvent> { event -> handleMouseEntered(event, connector) }
            val newMouseReleasedHandler = EventHandler<MouseEvent> { event -> handleMouseReleased(event) }

            val newDragDetectedHandler = EventHandler<MouseEvent> { event -> handleDragDetected(event, connectorSkin) }
            val newMouseDraggedHandler = EventHandler<MouseEvent> { event -> handleMouseDragged(event, connector) }
            val newMouseDragEnteredHandler = EventHandler<MouseDragEvent> { event -> handleDragEntered(event, connectorSkin) }
            val newMouseDragExitedHandler = EventHandler<MouseDragEvent> { event -> handleDragExited(event, connectorSkin) }
            val newMouseDragReleasedHandler = EventHandler<MouseDragEvent> { event -> handleDragReleased(event, connectorSkin) }

            root.addEventHandler(MouseEvent.MOUSE_ENTERED, newMouseEnteredHandler)
            root.addEventHandler(MouseEvent.MOUSE_EXITED, mouseExitedHandler)
            root.addEventHandler(MouseEvent.MOUSE_PRESSED, mousePressedHandler)
            root.addEventHandler(MouseEvent.MOUSE_RELEASED, newMouseReleasedHandler)

            root.addEventHandler(MouseEvent.DRAG_DETECTED, newDragDetectedHandler)
            root.addEventHandler(MouseEvent.MOUSE_DRAGGED, newMouseDraggedHandler)
            root.addEventHandler(MouseDragEvent.MOUSE_DRAG_ENTERED, newMouseDragEnteredHandler)
            root.addEventHandler(MouseDragEvent.MOUSE_DRAG_EXITED, newMouseDragExitedHandler)
            root.addEventHandler(MouseDragEvent.MOUSE_DRAG_RELEASED, newMouseDragReleasedHandler)

            mouseEnteredHandlers[root] = newMouseEnteredHandler
            mouseReleasedHandlers[root] = newMouseReleasedHandler

            dragDetectedHandlers[root] = newDragDetectedHandler
            mouseDraggedHandlers[root] = newMouseDraggedHandler
            mouseDragEnteredHandlers[root] = newMouseDragEnteredHandler
            mouseDragExitedHandlers[root] = newMouseDragExitedHandler
            mouseDragReleasedHandlers[root] = newMouseDragReleasedHandler
        }
    }

    /**
     * Handles mouse-entered events on the given connector.
     *
     * @param event
     *            a mouse-entered event
     * @param connector
     *            the {@link GConnector} on which this event occurred
     */
    private fun handleMouseEntered(event: MouseEvent, connector: GConnector) {
        hoveredConnector = connector
        event.consume()
    }

    /**
     * Handles mouse-exited events on the given connector.
     *
     * @param event
     *            a mouse-exited event
     */
    private fun handleMouseExited(event: MouseEvent) {
        hoveredConnector = null
        event.consume()
    }

    /**
     * Handles mouse-released events on the given connector.
     *
     * @param event
     *            a mouse-released event
     */
    private fun handleMouseReleased(event: MouseEvent) {
        val targetConnectorSkin = targetConnector?.let { skinLookup.lookupConnector(it) }
        targetConnectorSkin?.applyStyle(GConnectorStyle.DEFAULT)
        sourceConnector = null
        removalConnector = null
        repositionAllowed = true

        tailManager.cleanUp()
        finishGesture()

        event.consume()
    }

    /**
     * Handles drag-detected events on the given connector.
     *
     * @param event
     *            a drag-detected event
     * @param connectorSkin
     *            the {@link GConnectorSkin} on which this event occurred
     */
    private fun handleDragDetected(event: MouseEvent, connectorSkin: GConnectorSkin) {
        if (event.button != MouseButton.PRIMARY) return
        val connector: GConnector? = connectorSkin.item
        if (checkCreatable(connector) && activateGesture(event)) {
            sourceConnector = connector
            connectorSkin.root?.startFullDrag()
            tailManager.cleanUp()
            connector?.let {
                tailManager.create(connector, event)
            }
        } else if (checkRemovable(connector) && activateGesture(event)) {
            removalConnector = connector
            connectorSkin.root?.startFullDrag()
        }
        event.consume()
    }

    /**
     * Handles mouse-dragged events on the given connector.
     *
     * @param event
     *            a mouse-dragged event
     * @param connector
     *            the {@link GConnector} on which this event occurred
     */
    private fun handleMouseDragged(event: MouseEvent, connector: GConnector) {
        if (repositionAllowed && activateGesture(event)) {
            if (removalConnector?.equals(hoveredConnector) == true) {
                detachConnection(event, connector)
            } else {
                tailManager.updatePosition(event)
            }
            event.consume()
        }
    }

    /**
     * Handles drag-entered events on the given connector.
     *
     * @param event
     *            a drag-entered event
     * @param connectorSkin
     *            the {@link GConnectorSkin} on which this event occurred
     */
    private fun handleDragEntered(event: MouseEvent, connectorSkin: GConnectorSkin) {
        if (!activateGesture(event)) return
        val connector: GConnector? = connectorSkin.item
        if (validator?.prevalidate(sourceConnector, connector) == true) {
            val valid: Boolean = validator!!.validate(sourceConnector, connector)
            sourceConnector?.let {
                if (connector != null) {
                    tailManager.snapPosition(it, connector, valid)
                }
            }
            repositionAllowed = false
            if (valid) {
                connectorSkin.applyStyle(GConnectorStyle.DRAG_OVER_ALLOWED)
            } else {
                connectorSkin.applyStyle(GConnectorStyle.DRAG_OVER_FORBIDDEN)
            }
        }
        event.consume()
    }

    /**
     * Handles drag-exited events on the given connector.
     *
     * @param event
     *            a drag-exited event
     * @param connectorSkin
     *            the {@link GConnectorSkin} on which this event occurred
     */
    private fun handleDragExited(event: MouseEvent, connectorSkin: GConnectorSkin) {
        connectorSkin.applyStyle(GConnectorStyle.DEFAULT)
        repositionAllowed = true
        tailManager.updatePosition(event)
        event.consume()
    }

    /**
     * Handles drag-released events on the given connector.
     *
     * @param event
     *            a drag-released event
     * @param connectorSkin
     *            the {@link GConnectorSkin} on which this event occurred
     */
    private fun handleDragReleased(event: MouseEvent, connectorSkin: GConnectorSkin) {
        if (event.isConsumed) return
        event.consume()
        val connector: GConnector? = connectorSkin.item
        if (validator?.prevalidate(sourceConnector, connector) == true && validator?.validate(sourceConnector, connector) == true) {
            addConnection(sourceConnector, connector)
        }
        connectorSkin.applyStyle(GConnectorStyle.DEFAULT)
        tailManager.cleanUp()
        finishGesture()
    }


    /**
     * Checks if a connection can be created from the given connector.
     *
     * @param connector
     *            a {@link GConnector} instance
     * @return {@code true} if a connection can be created from the given
     *         {@link GConnector}, {@code false} if not
     */
    private fun checkCreatable(connector: GConnector?): Boolean {
        return checkEditable() && (connector?.connections!!.isEmpty() || !connector.connectionDetachedOnDrag)
    }

    private fun checkEditable(): Boolean = getEditorProperties()?.let { !it.isReadOnly(EditorElement.CONNECTOR) }
            ?: false

    /**
     * Checks if a connection can be removed from the given connector.
     *
     * @param connector
     *            a {@link GConnector} instance
     * @return {@code true} if a connection can be removed from the given
     *         {@link GConnector}, {@code false} if not
     */
    private fun checkRemovable(connector: GConnector?): Boolean {
        return checkEditable() && connector?.connections?.isNotEmpty() ?: false && connector?.connectionDetachedOnDrag ?: false
    }

    private fun getEditorProperties(): GraphEditorProperties {
        return view.editorProperties
    }

    /**
     * Adds a new connection to the model.
     *
     * <p>
     * This will trigger the model listener and cause everything to be
     * reinitialized.
     * </p>
     *
     * @param source
     *            the source {@link GConnector} for the new connection
     * @param target
     *            the target {@link GConnector} for the new connection
     */
    private fun addConnection(source: GConnector?, target: GConnector?) {
        val connectionType: String? = validator?.createConnectionType(source, target)
        val jointType: String? = validator?.createJointType(source, target)
        val jointPositions: List<Point2D> = source?.let { skinLookup.lookupTail(it)?.allocateJointPositions() }
                ?: listOf()
        val joints: MutableList<GJoint> = ArrayList()
        for (position in jointPositions) {
            val joint = GJoint()
            joint.x = position.x
            joint.y = position.y
            jointType?.let { joint.type = jointType }
            joints.add(joint)
        }
        source?.let { src ->
            target?.let { target ->
                connectionType?.let { connectionType ->
                    ConnectionCommands.addConnection(model, src, target, connectionType, joints, connectionEventManager)
                }
            }
        }

    }

    /**
     * Detaches the first connection from the given connector - i.e. removes the
     * connection and replaces it with a tail.
     *
     * @param event
     *            the {@link MouseEvent} that caused the connection to be
     *            detached
     * @param connector
     *            the connector that the connection was detached from
     */
    private fun detachConnection(event: MouseEvent, connector: GConnector) {
        val connectorSkin: GConnectorSkin? = skinLookup.lookupConnector(connector)
        val connectorCount: Int = getConnectorCount(connector)

        connectorSkin?.applyStyle(GConnectorStyle.DEFAULT)

        if (connector.connections.isEmpty()) return

        var followUpCreated = false

        val connections: Array<GConnection> = connector.connections.toTypedArray()
        for (connection in connections) {
            if (skinLookup.lookupConnection(connection) is VirtualSkin) {
                // do not touch virtual connections
                continue
            }

            val opposingConnector: GConnector = getOpposingConnector(connection, connector)
            val jointPositions = GeometryUtils.getJointPositions(connection, skinLookup).toMutableList()
            val newSource: GConnector = if (connector == connection.source) {
                jointPositions.reverse()
                connection.target
            } else {
                connection.source
            }

            ConnectionCommands.removeConnection(model, connection, connectionEventManager)

            val updateConnectorSkin: GConnectorSkin? = skinLookup.lookupConnector(connector)
            if (updateConnectorSkin == null || updateConnectorSkin != connectorSkin || connectorCount != getConnectorCount(connector)) {
                continue
            }

            if (!followUpCreated && checkCreatable(opposingConnector)) {
                newSource.let { tailManager.updateToNewSource(jointPositions, it, event) }
                sourceConnector = opposingConnector
                targetConnector = connector
                followUpCreated = true
            }
        }
        if (!followUpCreated) {
            clearTrackingParameters()
            sourceConnector = null
            targetConnector = null
            finishGesture()
        }
        removalConnector = null
    }

    private fun getOpposingConnector(connection: GConnection, connector: GConnector): GConnector {
        return if (connection.source != connector) {
            connection.source
        } else {
            connection.target
        }
    }

    private fun activateGesture(event: Event): Boolean {
        val eventManager: GraphEventManager? = getEditorProperties()
        eventManager?.activateGesture(GraphInputGesture.CONNECT, event, this)
        return true
    }

    private fun finishGesture() {
        val eventManager: GraphEventManager? = getEditorProperties()
        eventManager?.finishGesture(GraphInputGesture.CONNECT, this)
    }


    companion object {
        private fun <T : Event> removeSingleEventHandler(node: Node?, eventHandlerMap: MutableMap<Node, EventHandler<T>>, eventType: EventType<T>) {
            val handler = eventHandlerMap.remove(node)
            if (handler != null) {
                node?.removeEventHandler(eventType, handler)
            }
        }

        private fun getConnectorCount(connector: GConnector?): Int {
            return connector?.parent?.connectors?.size ?: 1
        }
    }
}