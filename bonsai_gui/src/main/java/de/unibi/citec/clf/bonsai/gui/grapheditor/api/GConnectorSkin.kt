package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector

/**
 * The skin class for a {@link GConnector}. Responsible for visualizing connectors in the graph editor.
 *
 * <p>
 * A custom connector skin must extend this class. It <b>must</b> also provide a constructor taking exactly one
 * {@link GConnector} parameter.
 * </p>
 *
 * <p>
 * The root JavaFX node must be created by the skin implementation and returned in the {@link #getRoot()} method.
 * </p>
 */
abstract class GConnectorSkin(connector: GConnector): GSkin<GConnector>(connector) {

    abstract val width: Double
    abstract val height: Double

    /**
     * Applys the specified style to the connector.
     *
     * <p>
     * This is called by the library during various mouse events. For example when a connector is dragged over another
     * connector in an attempt to create a new connection.
     * </p>
     *
     * @param style the {@link GConnectorStyle} to apply
     */
    abstract fun applyStyle(style: GConnectorStyle)
}