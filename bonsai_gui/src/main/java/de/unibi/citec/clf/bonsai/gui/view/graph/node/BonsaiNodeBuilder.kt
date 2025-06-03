package de.unibi.citec.clf.bonsai.gui.view.graph.node

import de.unibi.citec.clf.bonsai.gui.view.graph.core.BonsaiGraph
import javafx.scene.Node

class BonsaiNodeBuilder(val graph: BonsaiGraph) {

    private lateinit var node: Node
    private var posX: Double = 0.0
    private var posY: Double = 0.0

    fun node(node: Node): BonsaiNodeBuilder {
        this.node = node
        return this
    }

    fun x(x: Double): BonsaiNodeBuilder {
        posX = x
        return this
    }

    fun y(y: Double): BonsaiNodeBuilder {
        posY = y
        return this
    }

    fun build(): BonsaiNode {
        val node = BonsaiNode(node, graph)
        node.setPos(posX, posY)
        graph.addNode(node)
        return node
    }
}