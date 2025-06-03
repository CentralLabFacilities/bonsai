package de.unibi.citec.clf.bonsai.gui.view.graph.core

import javafx.animation.Animation
import javafx.animation.KeyFrame
import javafx.animation.Timeline
import javafx.util.Duration
import kotlin.math.abs

class BonsaiGraphZoomHandler(val graph: BonsaiGraph) {
    var currentZoomLevel: Double = 1.0
    private var targetZoomLevel: Double = 1.0

    private var zoomTimeline: Timeline

    init {
        val duration: Duration = Duration.millis(1000.0 / 25.0)
        val keyFrame = KeyFrame(duration, {
            updateNodePositionAndScale()
        })

        zoomTimeline = Timeline(keyFrame)
        zoomTimeline.cycleCount = Animation.INDEFINITE
        zoomTimeline.play()
    }

    private fun updateNodePositionAndScale() {

        var evolvePosition = false

        if (currentZoomLevel > targetZoomLevel) {
            currentZoomLevel -= (currentZoomLevel - targetZoomLevel) * 0.06
            evolvePosition = true
        }

        if (currentZoomLevel < targetZoomLevel) {
            currentZoomLevel += (targetZoomLevel - currentZoomLevel) * 0.06
            evolvePosition = true
        }

        if (evolvePosition) {
            for (node in graph.model.nodes.values) {
                node.setZoomLevel(currentZoomLevel)
            }
            graph.updateSelectionInScene()
        }

        if (abs(currentZoomLevel - targetZoomLevel) < 0.01) {
            currentZoomLevel = targetZoomLevel
        }
    }

    fun zoomOneStepIn() {
        targetZoomLevel -= 0.1
        if (targetZoomLevel < 0.1) {
            targetZoomLevel = 0.1
        }
        updateNodePositionAndScale()
    }

    fun zoomOneStepOut() {
        targetZoomLevel += 0.1

        updateNodePositionAndScale()
    }
}