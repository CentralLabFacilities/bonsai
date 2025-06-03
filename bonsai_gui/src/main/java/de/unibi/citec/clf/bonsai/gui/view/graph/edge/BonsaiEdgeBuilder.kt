package de.unibi.citec.clf.bonsai.gui.view.graph.edge

import de.unibi.citec.clf.bonsai.gui.view.graph.core.BonsaiGraph
import de.unibi.citec.clf.bonsai.gui.view.graph.node.BonsaiNode

class BonsaiEdgeBuilder(val graph: BonsaiGraph) {
    private val wayPoints: MutableList<BonsaiEdgeWayPoint> = mutableListOf()

    private lateinit var source: BonsaiNode
    private lateinit var destination: BonsaiNode

    fun source(source: BonsaiNode): BonsaiEdgeBuilder {
        this.source = source
        return this
    }

    fun destination(destination: BonsaiNode): BonsaiEdgeBuilder {
        this.destination = destination
        return this
    }

    fun wayPoint(wayPoint: BonsaiEdgeWayPoint): BonsaiEdgeBuilder {
        this.wayPoints.add(wayPoint)
        return this
    }

    fun build(): BonsaiEdge {
        val edge = BonsaiEdge(graph, source, destination)
        edge.wayPoints.addAll(wayPoints)
        graph.addEdge(edge)
        return edge
    }
}