package de.unibi.citec.clf.bonsai.gui.grapheditor.example.utils

import javafx.scene.Node
import javafx.scene.text.Font
import javafx.scene.text.Text

/**
 * A few icons.
 *
 *
 *
 * Uses Font Awesome by Dave Gandy - http://fontawesome.io.
 *
 */
enum class AwesomeIcon
/**
 * Creates a new awesome icon for the given unicode value.
 *
 * @param unicode the unicode value as an integer
 */(private val unicode: Int) {
    /**
     * A plus icon.
     */
    PLUS(0xf067),

    /**
     * A times / cross icon.
     */
    TIMES(0xf00d),

    /**
     * A map icon.
     */
    MAP(0xf03e);

    /**
     * Returns a new [Node] containing the icon.
     *
     * @return a new node containing the icon
     */
    fun node(): Node {
        val text = Text(unicode.toChar().toString())
        text.styleClass.setAll(STYLE_CLASS)
        text.font = Font.font(FONT_AWESOME)
        return text
    }

    companion object {
        private const val STYLE_CLASS = "icon" //$NON-NLS-1$
        private const val FONT_AWESOME = "FontAwesome" //$NON-NLS-1$
    }
}