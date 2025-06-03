package de.unibi.citec.clf.bonsai.gui.model.graph

import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdge
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiNode
import javafx.scene.Node

/**
 * Representation of the actual graph.
 */
class BonsaiGraphModel {
    val nodes: HashMap<Node, BonsaiNode> = HashMap()
    val edges: HashSet<BonsaiEdge> = HashSet()

    /**
     * Adds given node to the graph
     *
     * @param node: BonsaiNode which should be added
     */
    fun registerNewNode(node: BonsaiNode) {
        nodes[node.wrappedNode] = node
    }

    /**
     * Removes given node from the graph.
     *
     * @param node: BonsaiNode which should be removed
     */
    fun removeNode(node: BonsaiNode) {
        nodes.remove(node.wrappedNode)
    }

    /**
     * Adds given edge to the graph.
     *
     * @param edge: Bonsai-Edge which should be added
     */
    fun registerNewEdge(edge: BonsaiEdge) {
        edges.add(edge)
    }

    /**
     * Removes given edge from the graph.
     *
     * @param edge: BonsaiEdge which should be removed
     */
    fun removeEdge(edge: BonsaiEdge) {
        edges.remove(edge)
    }
}