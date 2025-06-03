package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.utils

import javafx.animation.Animation
import javafx.animation.KeyFrame
import javafx.animation.KeyValue
import javafx.animation.Timeline
import javafx.beans.property.ObjectProperty
import javafx.beans.property.SimpleObjectProperty
import javafx.scene.Node
import javafx.scene.paint.Color
import javafx.util.Duration


object ColorAnimationUtils {

    private const val TIMELINE_KEY = "color-animation-utils-timeline"
    private const val COLOR_FORMAT = "#%02x%02x%02x"

    fun animateColor(node: Node, data: AnimatedColor) {

        removeAnimation(node)

        val baseColor: ObjectProperty<Color> = SimpleObjectProperty()

        val firstKeyValue = KeyValue(baseColor, data.first)
        val secondKeyValue = KeyValue(baseColor, data.second)
        val firstKeyFrame = KeyFrame(Duration.ZERO, firstKeyValue)
        val secondKeyFrame = KeyFrame(data.interval, secondKeyValue)
        val timeline = Timeline(firstKeyFrame, secondKeyFrame)

        baseColor.addListener { _, _, new ->
            val redValue = (new.red * 255).toInt()
            val greenValue = (new.green * 255).toInt()
            val blueValue = (new.blue * 255).toInt()

            val format = "${data.property}: $COLOR_FORMAT;"
            node.style = String.format(format, redValue, greenValue, blueValue)
        }

        node.properties[TIMELINE_KEY] = timeline

        timeline.isAutoReverse = true
        timeline.cycleCount = Animation.INDEFINITE
        timeline.play()
    }

    fun removeAnimation(node: Node) {
        node.properties[TIMELINE_KEY]?.let {
            when(it) {
                is Timeline -> it.stop()
            }
        }
    }

}