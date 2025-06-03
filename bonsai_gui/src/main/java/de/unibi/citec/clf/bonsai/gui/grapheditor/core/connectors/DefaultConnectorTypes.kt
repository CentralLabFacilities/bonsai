package de.unibi.citec.clf.bonsai.gui.grapheditor.core.connectors

import javafx.geometry.Side

/**
 * This class defines 8 connector types. The connectors can be:
 *
 * <ol>
 * <li>Either <b>input</b> or <b>output</b></li>
 * <li>Either <b>top</b>, <b>right</b>, <b>bottom</b>, or <b>left</b></li>
 * </ol>
 *
 * For example <b>left-input</b> defines a connector on the <em>left</em> side
 * of a node, with a triangle point facing <em>into</em> the node.
 */
object DefaultConnectorTypes {

    const val TOP_INPUT: String = "top-input"
    const val TOP_OUTPUT: String = "top-output"
    const val RIGHT_INPUT: String = "right-input"
    const val RIGHT_OUTPUT: String = "right-output"
    const val BOTTOM_INPUT: String = "bottom-input"
    const val BOTTOM_OUTPUT: String = "bottom-output"
    const val LEFT_INPUT: String = "left-input"
    const val LEFT_OUTPUT: String = "left-output"

    private const val LEFT_SIDE: String = "left"
    private const val RIGHT_SIDE: String = "right"
    private const val TOP_SIDE: String = "top"
    private const val BOTTOM_SIDE: String = "bottom"

    private const val INPUT: String = "input"
    private const val OUTPUT: String = "output"

    /**
     * Returns true if the type is supported by the default skins.
     *
     * @param type
     *            a connector's type string
     * @return {@code true} if the type is supported by the default skins
     */
    fun isValid(type: String): Boolean {
        val hasSide: Boolean = type.let { isTop(type) || isRight(type) || isBottom(type) || isLeft(type) }
        val inputOrOutput: Boolean = type.let { isInput(type) || isOutput(type) }
        return hasSide && inputOrOutput
    }

    /**
     * Gets the side corresponding to the given connector type.
     *
     * @param type
     *            a non-null connector type
     * @return the {@link Side} the connector type is on
     */
    fun getSide(type: String?): Side? {
        return when {
            isTop(type) -> Side.TOP
            isRight(type) -> Side.RIGHT
            isBottom(type) -> Side.BOTTOM
            isLeft(type) -> Side.LEFT
            else -> null
        }
    }

    /**
     * Returns true if the type corresponds to a connector positioned at the top
     * of a node.
     *
     * @param type
     *            a connector's type string
     * @return {@code true} if the connector will be positioned at the top of a
     *         node
     */
    fun isTop(type: String?): Boolean {
        return type?.contains(TOP_SIDE) ?: false
    }

    /**
     * Returns true if the type corresponds to a connector positioned on the
     * right side of a node.
     *
     * @param type
     *            a connector's type string
     * @return {@code true} if the connector will be positioned on the right
     *         side of a node
     */
    fun isRight(type: String?): Boolean {
        return type?.contains(RIGHT_SIDE) ?: false
    }

    /**
     * Returns true if the type corresponds to a connector positioned at the
     * bottom of a node.
     *
     * @param type
     *            a connector's type string
     * @return {@code true} if the connector will be positioned at the bottom of
     *         a node
     */
    fun isBottom(type: String?): Boolean {
        return type?.contains(BOTTOM_SIDE) ?: false
    }

    /**
     * Returns true if the type corresponds to a connector positioned on the
     * left side of a node.
     *
     * @param type
     *            a connector's type string
     * @return {@code true} if the connector will be positioned on the left side
     *         of a node
     */
    fun isLeft(type: String?): Boolean {
        return type?.contains(LEFT_SIDE) ?: false
    }

    /**
     * Returns true if the type corresponds to an input connector.
     *
     * @param type
     *            a connector's type string
     * @return {@code true} if the connector is any kind of input
     */
    fun isInput(type: String): Boolean {
        return type.contains(INPUT)
    }

    /**
     * Returns true if the type corresponds to an output connector.
     *
     * @param type
     *            a connector's type string
     * @return {@code true} if the connector is any kind of output
     */
    fun isOutput(type: String): Boolean {
        return type.contains(OUTPUT)
    }

    /**
     * Returns true if the two given types are on the same side of a node.
     *
     * @param firstType
     *            the first connector type
     * @param secondType
     *            the second connector type
     * @return {@code true} if the connectors are on the same side of a node
     */
    fun isSameSide(firstType: String, secondType: String): Boolean {
        return getSide(firstType)?.let { it == getSide(secondType) } ?: false
    }

}