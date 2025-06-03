//FIXME: Move this in the actual model package
package de.unibi.citec.clf.bonsai.gui.view.graph.core

import de.unibi.citec.clf.bonsai.gui.view.graph.edge.BonsaiEdge
import de.unibi.citec.clf.bonsai.gui.view.graph.node.BonsaiNode
import javafx.scene.Node

class BonsaiGraphModel {
    val nodes: HashMap<Node, BonsaiNode> = HashMap()
    val edges: HashSet<BonsaiEdge> = HashSet()

    fun registerNewNode(node: BonsaiNode) {
        nodes[node.wrappedNode] = node
    }

    fun registerNewEdge(edge: BonsaiEdge) {
        edges.add(edge)
    }
}