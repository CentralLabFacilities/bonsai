package de.unibi.citec.clf.bonsai.gui.grapheditor.example.selections

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SelectionManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.ConnectionCopier
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.utils.BeanUtils.copyBean
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.AddCommand
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CommandStack
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CompoundCommand
import javafx.collections.ObservableList
import javafx.geometry.Point2D
import javafx.scene.Node
import javafx.scene.Parent
import javafx.scene.layout.Region
import java.util.function.BiConsumer

/**
 * Manages cut, copy and paste actions on the current selection.
 *
 *
 *
 * The rules for what is copied are as follows:
 *
 *  1. All selected nodes and their connectors (containment references) are copied.
 *  1. If a connection's source and target nodes are **both** copied, the connection and its joints are also copied.
 *
 *
 */
class SelectionCopier
/**
 * Creates a new [SelectionCopier] instance.
 *
 * @param skinLookup
 * the [SkinLookup] instance for the graph editor
 * @param selectionManager
 * the [SelectionManager] instance for the graph editor
 */(private val skinLookup: SkinLookup, private val selectionManager: SelectionManager) {
    private val copiedNodes: MutableList<GNode?> = ArrayList()
    private val copiedConnections: MutableList<GConnection> = ArrayList()
    private var parentAtTimeOfCopy: Parent? = null
    private var parentSceneXAtTimeOfCopy = 0.0
    private var parentSceneYAtTimeOfCopy = 0.0
    private var model: GModel? = null
    private val ol: ObservableList<*>? = null

    /**
     * Initializes the selection copier for the current model.
     *
     * @param model the [GModel] currently being edited
     */
    fun initialize(model: GModel?) {
        this.model = model
    }

    /**
     * Copies the current selection and stores it in memory.
     */
    fun copy() {
        if (selectionManager.selectedItems.isEmpty()) {
            return
        }
        copiedNodes.clear()
        copiedConnections.clear()
        val copyStorage: MutableMap<GNode?, GNode?> = HashMap()

        // Don't iterate directly over selectionTracker.getSelectedNodes() because that will not preserve ordering.
        for (node in model!!.nodes) {
            if (selectionManager.isSelected(node)) {
                val copiedNode = copyBean(node)
                copiedNodes.add(copiedNode)
                copyStorage[node] = copiedNode
            }
        }
        copiedConnections.addAll(ConnectionCopier.copyConnections(copyStorage))
        saveParentPositionInScene()
    }

    /**
     * Pastes the most-recently-copied selection.
     *
     *
     *
     * After the paste operation, the newly-pasted elements will be selected.
     *
     *
     * @param consumer a consumer to allow custom commands to be appended to the paste command
     * @return the list of new [GNode] instances created by the paste operation
     */
    fun paste(consumer: BiConsumer<List<GNode?>, CompoundCommand>?): List<GNode?> {
        selectionManager.clearSelection()
        val pastedNodes: MutableList<GNode?> = ArrayList()
        val pastedConnections: MutableList<GConnection> = ArrayList()
        preparePastedElements(pastedNodes, pastedConnections)
        addPasteOffset(pastedNodes, pastedConnections)
        checkWithinBounds(pastedNodes, pastedConnections)
        addPastedElements(pastedNodes, pastedConnections, consumer)
        for (pastedNode in pastedNodes) {
            selectionManager.select(pastedNode!!)
        }
        for (pastedConnection in pastedConnections) {
            for (pastedJoint in pastedConnection.joints) {
                selectionManager.select(pastedJoint)
            }
        }
        return pastedNodes
    }

    /**
     * Clears the memory of what was cut / copied. Future paste operations will do nothing.
     */
    fun clearMemory() {
        copiedNodes.clear()
        copiedConnections.clear()
    }

    /**
     * Prepares the lists of pasted nodes and connections.
     *
     * @param pastedNodes an empty list to be filled with pasted nodes
     * @param pastedConnections an empty list to be filled with pasted connections
     */
    private fun preparePastedElements(pastedNodes: MutableList<GNode?>, pastedConnections: MutableList<GConnection>) {
        val pasteStorage: MutableMap<GNode?, GNode?> = HashMap()
        for (copiedNode in copiedNodes) {
            val pastedNode = copyBean<GNode>(copiedNode!!)
            pastedNodes.add(pastedNode)
            pasteStorage[copiedNode] = pastedNode
        }
        pastedConnections.addAll(ConnectionCopier.copyConnections(pasteStorage))
    }

    /**
     * Adds an x and y offset to all nodes and connections that are about to be pasted.
     *
     * @param pastedNodes the nodes that are going to be pasted
     * @param pastedConnections the connections that are going to be pasted
     */
    private fun addPasteOffset(pastedNodes: List<GNode?>, pastedConnections: List<GConnection>) {
        val pasteOffset = determinePasteOffset()
        for (node in pastedNodes) {
            node!!.x = node.x + pasteOffset.x
            node.y = node.y + pasteOffset.y
        }
        for (connection in pastedConnections) {
            for (joint in connection.joints) {
                joint.x = joint.x + pasteOffset.x
                joint.y = joint.y + pasteOffset.y
            }
        }
    }

    /**
     * Checks that the pasted node and joints will be inside the bounds of their parent.
     *
     *
     *
     * Corrects the x and y positions accordingly if they will be outside the bounds.
     *
     *
     * @param pastedNodes the nodes that are going to be pasted
     * @param pastedConnections the connections that are going to be pasted
     */
    private fun checkWithinBounds(pastedNodes: List<GNode?>, pastedConnections: List<GConnection>) {
        if (parentAtTimeOfCopy is Region) {
            val parentRegion = parentAtTimeOfCopy as Region
            val parentBounds = getBounds(parentRegion)
            val contentBounds = getContentBounds(pastedNodes, pastedConnections)
            var xCorrection = 0.0
            var yCorrection = 0.0
            if (contentBounds.startX < parentBounds.startX) {
                xCorrection = parentBounds.startX - contentBounds.startX
            } else if (contentBounds.endX > parentBounds.endX) {
                xCorrection = parentBounds.endX - contentBounds.endX
            }
            if (contentBounds.startY < parentBounds.startY) {
                yCorrection = parentBounds.startY - contentBounds.startY
            } else if (contentBounds.endY > parentBounds.endY) {
                yCorrection = parentBounds.endY - contentBounds.endY
            }
            if (xCorrection != 0.0 || yCorrection != 0.0) {
                for (node in pastedNodes) {
                    node!!.x = node.x + xCorrection
                    node.y = node.y + yCorrection
                }
                for (connection in pastedConnections) {
                    for (joint in connection.joints) {
                        joint.x = joint.x + xCorrection
                        joint.y = joint.y + yCorrection
                    }
                }
            }
        }
    }

    /**
     * Adds the pasted elements to the graph editor via a single EMF command.
     *
     * @param pastedNodes the pasted nodes to be added
     * @param pastedConnections the pasted connections to be added
     * @param consumer a consumer to allow custom commands to be appended to the paste command
     */
    private fun addPastedElements(pastedNodes: List<GNode?>, pastedConnections: List<GConnection>,
                                  consumer: BiConsumer<List<GNode?>, CompoundCommand>?) {
        val command = CompoundCommand()
        for (pastedNode in pastedNodes) {
            //command.append(AddCommand.create(editingDomain, model, NODES, pastedNode));
            command.append(AddCommand.create(model!!, { owner -> model!!.nodes }, pastedNode!!))
        }
        for (pastedConnection in pastedConnections) {
            //command.append(AddCommand.create(editingDomain, model, CONNECTIONS, pastedConnection));
            command.append(AddCommand.create(model!!, { owner -> model!!.connections }, pastedConnection))
        }
        if (command.canExecute()) {
            CommandStack.getCommandStack(model!!).execute(command)
        }
        consumer?.accept(pastedNodes, command)
    }

    /**
     * Saves the position in the scene of the JavaFX [Parent] of the node skins.
     */
    private fun saveParentPositionInScene() {
        if (!selectionManager.selectedItems.isEmpty()) {
            val firstSelectedNode = selectionManager.selectedNodes[0]
            val firstSelectedNodeSkin = skinLookup.lookupNode(firstSelectedNode)
            val root: Node? = firstSelectedNodeSkin!!.root
            val parent = root!!.parent
            if (parent != null) {
                parentAtTimeOfCopy = parent
                val localToScene = parent.localToScene(0.0, 0.0)
                parentSceneXAtTimeOfCopy = localToScene.x
                parentSceneYAtTimeOfCopy = localToScene.y
            }
        }
    }

    /**
     * Determines the offset by which the new nodes and joints should be positioned relative to the nodes and joints
     * they were copied from.
     *
     *
     *
     * The aim here is to paste the new nodes and joints into a **visible** area on the screen, even if the user has
     * panned around in the graph editor container since the copy-action took place.
     *
     *
     * @return a [Point2D] containing the x and y offsets
     */
    private fun determinePasteOffset(): Point2D {
        var offsetX = BASE_PASTE_OFFSET
        var offsetY = BASE_PASTE_OFFSET
        if (parentAtTimeOfCopy != null) {
            val localToScene = parentAtTimeOfCopy!!.localToScene(0.0, 0.0)
            val parentSceneXAtTimeOfPaste = localToScene.x
            val parentSceneYAtTimeOfPaste = localToScene.y
            offsetX += parentSceneXAtTimeOfCopy - parentSceneXAtTimeOfPaste
            offsetY += parentSceneYAtTimeOfCopy - parentSceneYAtTimeOfPaste
        }
        return Point2D(offsetX, offsetY)
    }

    /**
     * Gets the start and end x- and y-positions of the given region (including insets).
     *
     * @param region a [Region]
     * @return the bounds of the given region
     */
    private fun getBounds(region: Region): Bounds {
        val bounds: Bounds = Bounds()
        bounds.startX = region.insets.left
        bounds.startY = region.insets.top
        bounds.endX = region.width - region.insets.right
        bounds.endY = region.height - region.insets.bottom
        return bounds
    }

    /**
     * Gets the start and end x- and y-positions of the given group of nodes and joints.
     *
     * @param nodes a list of nodes
     * @param connections a list of connections
     * @return the start and end x- and y-positions of the given nodes and joints.
     */
    private fun getContentBounds(nodes: List<GNode?>, connections: List<GConnection>): Bounds {
        val contentBounds: Bounds = Bounds()
        contentBounds.startX = Double.MAX_VALUE
        contentBounds.startY = Double.MAX_VALUE
        contentBounds.endX = 0.0
        contentBounds.endY = 0.0
        for (node in nodes) {
            if (node!!.x < contentBounds.startX) {
                contentBounds.startX = node.x
            }
            if (node.y < contentBounds.startY) {
                contentBounds.startY = node.y
            }
            if (node.x + node.width > contentBounds.endX) {
                contentBounds.endX = node.x + node.width
            }
            if (node.y + node.height > contentBounds.endY) {
                contentBounds.endY = node.y + node.height
            }
        }
        for (connection in connections) {
            for (joint in connection.joints) {
                if (joint.x < contentBounds.startX) {
                    contentBounds.startX = joint.x
                }
                if (joint.y < contentBounds.startY) {
                    contentBounds.startY = joint.y
                }
                if (joint.x > contentBounds.endX) {
                    contentBounds.endX = joint.x
                }
                if (joint.y > contentBounds.endY) {
                    contentBounds.endY = joint.y
                }
            }
        }
        return contentBounds
    }

    /**
     * Stores start and end x- and y-positions of a rectangular object.
     */
    private inner class Bounds {
        var startX = 0.0
        var startY = 0.0
        var endX = 0.0
        var endY = 0.0
    }

    companion object {
        //    private static final EReference NODES = GraphPackage.Literals.GMODEL__NODES;
        //    private static final EReference CONNECTIONS = GraphPackage.Literals.GMODEL__CONNECTIONS;
        private const val BASE_PASTE_OFFSET = 20.0
    }
}