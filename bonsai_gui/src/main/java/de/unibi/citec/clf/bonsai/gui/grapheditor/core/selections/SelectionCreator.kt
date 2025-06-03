package de.unibi.citec.clf.bonsai.gui.grapheditor.core.selections

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphInputGesture
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.utils.EventUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorView
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.*
import javafx.event.Event
import javafx.event.EventHandler
import javafx.geometry.Point2D
import javafx.geometry.Rectangle2D
import javafx.scene.Node
import javafx.scene.input.MouseButton
import javafx.scene.input.MouseEvent
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class SelectionCreator(
        val skinLookup: SkinLookup, val view: GraphEditorView, val selectionManager: SelectionManager,
        private val selectionDragManager: SelectionDragManager
) {

    private var model: GModel? = null

    private val mousePressedHandlers: MutableMap<Node, EventHandler<MouseEvent>> = HashMap()
    private val mouseClickedHandlers: MutableMap<Node, EventHandler<MouseEvent>> = HashMap()

    private val selectedElementsBackup: MutableSet<Selectable> = mutableSetOf()

    private var selection: Rectangle2D? = null

    private var selectionBoxStart: Point2D? = null
    private var selectionBoxEnd: Point2D? = null




    init {
        val viewPressedHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> { event ->
            handleViewPressed(event)
        }

        val viewDraggedHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> { event ->
            handleViewDragged(event)
        }

        val viewReleasedHandler: EventHandler<MouseEvent> = EventHandler<MouseEvent> { event ->
            handleViewReleased(event)
        }

        view.addEventHandler(MouseEvent.MOUSE_PRESSED, viewPressedHandler)
        view.addEventHandler(MouseEvent.MOUSE_DRAGGED, viewDraggedHandler)
        view.addEventHandler(MouseEvent.MOUSE_RELEASED, viewReleasedHandler)
    }

    fun initialize(model: GModel) {
        this.model = model
        addClickSelectionMechanism()
    }

    private fun addClickSelectionMechanism() {
        EventUtils.removeEventHandlers(mousePressedHandlers, MouseEvent.MOUSE_PRESSED)
        EventUtils.removeEventHandlers(mouseClickedHandlers, MouseEvent.MOUSE_CLICKED)
        model.let {
            addClickSelectionForNodes()
            addClickSelectionForJoints()
        }
    }

    private fun handleSelectionClick(event: MouseEvent, skin: GSkin<*>) {
        if (MouseButton.PRIMARY != event.button) return
        if (!skin.selected) {
            if (!event.isShortcutDown) {
                selectionManager.clearSelection()
            } else {
                backupSelections()
            }
            skin.item?.let { selectionManager.select(skin.item) }
        } else {
            if (event.isShortcutDown) {
                skin.item?.let { selectionManager.clearSelection(it) }
            }
        }
        event.consume()
    }

    fun addNode(node: GNode) {
        skinLookup.lookupNode(node)?.let { skin ->
            skin.root?.let { nodeRegion ->
                if (!mousePressedHandlers.containsKey(nodeRegion)) {
                    val newNodePressedHandler: EventHandler<MouseEvent> =
                            EventHandler<MouseEvent> { event -> handleNodePressed(event, skin) }
                    nodeRegion.addEventHandler(MouseEvent.MOUSE_PRESSED, newNodePressedHandler)
                    mousePressedHandlers[nodeRegion] = newNodePressedHandler
                }
            }
            for (connector in node.connectors) {
                addConnector(connector)
            }
        }
    }

    fun removeNode(node: GNode) {
        skinLookup.lookupNode(node)?.root?.let { nodeRegion ->
            mousePressedHandlers.remove(nodeRegion).let {
                nodeRegion.removeEventHandler(MouseEvent.MOUSE_PRESSED, it)
            }
            for (connector in node.connectors) {
                removeConnector(connector)
            }
        }
    }

    fun addConnector(connector: GConnector) {
        skinLookup.lookupConnector(connector)?.let { skin ->
            skin.root?.let { skinRoot ->
                if (!mouseClickedHandlers.containsKey(skinRoot)) {
                    val connectorClickedHandler: EventHandler<MouseEvent> =
                            EventHandler<MouseEvent> { event -> handleSelectionClick(event, skin) }
                    skinRoot.addEventHandler(MouseEvent.MOUSE_CLICKED, connectorClickedHandler)
                    mousePressedHandlers[skinRoot] = connectorClickedHandler
                }
            }
        }
    }

    fun removeConnector(connector: GConnector) {
        skinLookup.lookupConnector(connector)?.let { skin ->
            mouseClickedHandlers.remove(skin.root)?.let {
                skin.root?.removeEventHandler(MouseEvent.MOUSE_CLICKED, it)
            }
        }
    }

    fun addConnection(connection: GConnection) {
        skinLookup.lookupConnection(connection)?.let { skin ->
            if (!mousePressedHandlers.containsKey(skin.root)) {
                val connectionPressedHandler: EventHandler<MouseEvent> =
                        EventHandler<MouseEvent> { event -> handleConnectionPressed(event, connection) }
                skin.root?.addEventHandler(MouseEvent.MOUSE_PRESSED, connectionPressedHandler)
                skin.root?.let { mousePressedHandlers[it] = connectionPressedHandler }
            }
        }
    }

    fun removeConnection(connection: GConnection) {
        skinLookup.lookupConnection(connection)?.let { skin ->
            mousePressedHandlers.remove(skin.root).let {
                skin.root?.removeEventHandler(MouseEvent.MOUSE_PRESSED, it)
            }
        }
        for (joint in connection.joints) {
            removeJoint(joint)
        }
    }

    fun addJoint(joint: GJoint) {
        skinLookup.lookupJoint(joint)?.let { skin ->
            skin.root?.let { root ->
                if (!mousePressedHandlers.containsKey(root)) {
                    val jointPressedHandler: EventHandler<MouseEvent> =
                            EventHandler<MouseEvent> { event -> handleJointPressed(event, skin) }
                    root.addEventHandler(MouseEvent.MOUSE_PRESSED, jointPressedHandler)
                    mousePressedHandlers[root] = jointPressedHandler
                }
            }

        }
    }

    fun removeJoint(joint: GJoint) {
        skinLookup.lookupJoint(joint)?.root?.let { root ->
            mousePressedHandlers.remove(root)?.let {
                root.removeEventHandler(MouseEvent.MOUSE_PRESSED, it)
            }
        }

    }


    private fun addClickSelectionForNodes() {
        model?.let {
            for (node in it.nodes) {
                addNode(node)
            }
        }

    }

    private fun addClickSelectionForJoints() {
        model?.let {
            for (connection in it.connections) {
                connection?.let { addConnection(connection) }
            }
        }

    }

    private fun handleNodePressed(event: MouseEvent, nodeSkin: GNodeSkin) {
        if (MouseButton.PRIMARY != event.button) return
        handleSelectionClick(event, nodeSkin)
        nodeSkin.root?.let {
            if (!it.isMouseInPositionForResize()) selectionDragManager.bindPositions(it)
            event.consume()
        }

    }

    private fun handleConnectionPressed(event: MouseEvent, connection: GConnection) {
        if (MouseButton.PRIMARY != event.button) return
        skinLookup.lookupConnection(connection)?.let {
            handleSelectionClick(event, it)
        }
        event.consume()
    }

    private fun handleJointPressed(event: MouseEvent, jointSkin: GJointSkin) {
        if (MouseButton.PRIMARY != event.button) return
        handleSelectionClick(event, jointSkin)
        jointSkin.root?.let { selectionDragManager.bindPositions(it) }
        event.consume()
    }

    private fun handleViewPressed(event: MouseEvent) {
        if (model == null || event.isConsumed || !activateGesture(event)) return
        if (!event.isShortcutDown) selectionManager.clearSelection() else backupSelections()
        selectionBoxStart = Point2D(max(0.0, event.x), max(0.0, event.y))
    }


    private fun handleViewDragged(event: MouseEvent) {
        if (model == null || event.isConsumed || selectionBoxStart == null || !activateGesture(event)) return
        selectionBoxEnd =
                Point2D(min(model!!.contentWidth, max(0.0, event.x)), min(model!!.contentHeight, max(0.0, event.y)))
        evaluateSelectionBoxParameters()
        view.drawSelectionBox(selection?.minX ?: 0.0, selection?.minY ?: 0.0, selection?.width ?: 0.0, selection?.height
                ?: 0.0)
        updatedSelection(event.isShortcutDown)
    }

    private fun handleViewReleased(event: MouseEvent) {
        selectionBoxStart = null
        if (finishGesture()) event.consume()
        view.hideSelectionBox()
    }

    private fun isNodeSelected(node: GNode, isShortcutDown: Boolean): Boolean {
        return selection?.contains(
                node.x,
                node.y,
                node.width,
                node.height
        ) ?: false || isShortcutDown && selectedElementsBackup.contains(node)
    }

    private fun isJointSelected(joint: GJoint, isShortcutDown: Boolean): Boolean {
        return selection?.contains(
                joint.x,
                joint.y
        ) ?: false || isShortcutDown && selectedElementsBackup.contains(joint)
    }

    private fun isConnectionSelected(connection: GConnection, isShortcutDown: Boolean): Boolean {
        return isShortcutDown && selectedElementsBackup.contains(connection)
    }

    private fun updatedSelection(isShortcutDown: Boolean) {
        model.let {
            for (node in it!!.nodes) {
                if (isNodeSelected(node, isShortcutDown)) {
                    selectionManager.select(node)
                } else {
                    selectionManager.clearSelection(node)
                }
            }
            for (connection in it.connections) {
                connection?.let { connection ->
                    if (isConnectionSelected(connection, isShortcutDown)) {
                        selectionManager.select(connection)
                    } else {
                        selectionManager.clearSelection(connection)
                    }
                    for (joint in connection.joints) {
                        if (isJointSelected(joint, isShortcutDown)) {
                            selectionManager.select(joint)
                        } else {
                            selectionManager.clearSelection(joint)
                        }
                    }
                }


            }
        }
    }

    private fun backupSelections() {
        selectedElementsBackup.clear()
        selectedElementsBackup.addAll(selectionManager.selectedItems)
    }

    private fun evaluateSelectionBoxParameters() {
        selectionBoxStart?.let { start ->
            selectionBoxEnd?.let { end ->
                val x: Double = min(start.x, end.x)
                val y: Double = min(start.y, end.y)
                val width: Double = abs(start.x - end.x)
                val height: Double = abs(start.y - end.y)
                selection = Rectangle2D(x, y, width, height)
            }
        }
    }

    private fun activateGesture(event: Event): Boolean {
        return view.editorProperties.activateGesture(GraphInputGesture.SELECT, event, this) ?: true
    }

    private fun finishGesture(): Boolean {
        return view.editorProperties.finishGesture(GraphInputGesture.SELECT, this) ?: true
    }
}