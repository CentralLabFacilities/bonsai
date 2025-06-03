package de.unibi.citec.clf.bonsai.gui.controller.graph.tools

import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdge
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiEdgeWayPoint
import de.unibi.citec.clf.bonsai.gui.view.graph.BonsaiNode
import javafx.scene.input.MouseEvent

abstract class BonsaiGraphTool {
    abstract fun mousePressedOnNode(event: MouseEvent, node: BonsaiNode)
    abstract fun mousePressedOnEdge(event: MouseEvent, edge: BonsaiEdge)
    abstract fun mousePressedOnEdgeWayPoint(event: MouseEvent, wayPoint: BonsaiEdgeWayPoint)
    abstract fun mousePressed(event: MouseEvent)
    abstract fun mouseDragged(event: MouseEvent)
    abstract fun mouseReleased(event: MouseEvent)
}