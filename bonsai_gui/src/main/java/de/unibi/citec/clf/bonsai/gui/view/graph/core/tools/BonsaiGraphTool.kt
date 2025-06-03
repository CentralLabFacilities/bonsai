package de.unibi.citec.clf.bonsai.gui.view.graph.core.tools

import de.unibi.citec.clf.bonsai.gui.view.graph.edge.BonsaiEdge
import de.unibi.citec.clf.bonsai.gui.view.graph.edge.BonsaiEdgeWayPoint
import de.unibi.citec.clf.bonsai.gui.view.graph.node.BonsaiNode
import javafx.scene.input.MouseEvent

abstract class BonsaiGraphTool {
    abstract fun mousePressedOnNode(event: MouseEvent, node: BonsaiNode)
    abstract fun mousePressedOnEdge(event: MouseEvent, edge: BonsaiEdge)
    abstract fun mousePressedOnEdgeWayPoint(event: MouseEvent, wayPoint: BonsaiEdgeWayPoint)
    abstract fun mousePressed(event: MouseEvent)
    abstract fun mouseDragged(event: MouseEvent)
    abstract fun mouseReleased(event: MouseEvent)
}