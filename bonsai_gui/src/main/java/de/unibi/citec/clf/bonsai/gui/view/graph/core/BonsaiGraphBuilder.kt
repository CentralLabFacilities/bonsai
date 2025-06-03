package de.unibi.citec.clf.bonsai.gui.view.graph.core

class BonsaiGraphBuilder private constructor() {
    companion object {
        fun create(): BonsaiGraphBuilder {
            return BonsaiGraphBuilder()
        }
    }

    fun build(): BonsaiGraph {
        return BonsaiGraph()
    }
}