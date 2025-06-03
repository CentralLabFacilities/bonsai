package de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils

/**
 * Defines the various input gestures used by the graph editor
 */
enum class GraphInputGesture {

    /**
     * Panning / moving the graph editor viewport
     */
    PAN,

    /**
     * Zooming the graph editor viewport
     */
    ZOOM,

    /**
     * Resizing graph editor elements
     */
    RESIZE,

    /**
     * Moving graph editor elements
     */
    MOVE,

    /**
     * Connecting graph editor elements
     */
    CONNECT,

    /**
     * Selecting graph editor elements
     */
    SELECT,

    /**
     * Does nothing. Default value.
     */
    NONE
}