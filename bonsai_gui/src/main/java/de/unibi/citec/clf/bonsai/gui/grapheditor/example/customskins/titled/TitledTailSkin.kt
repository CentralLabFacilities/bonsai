package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.titled

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils.moveOnPixel
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.DefaultTailSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.geometry.Point2D

class TitledTailSkin(connector: GConnector?) : DefaultTailSkin(connector!!) {
    /**
     * Creates a new default tail skin instance.
     *
     * @param connector the [GConnector] the skin is being created for
     */
    init {
        line.styleClass.setAll(STYLE_CLASS)
        endpoint.styleClass.setAll(STYLE_CLASS_ENDPOINT)
        endpoint.points.setAll(0.0, 0.0, 0.0, SIZE, SIZE, SIZE, SIZE, 0.0)
        group.isManaged = false
    }

    override fun layoutEndpoint(position: Point2D) {
        endpoint.layoutX = moveOnPixel(position.x - SIZE / 2)
        endpoint.layoutY = moveOnPixel(position.y - SIZE / 2)
    }

    companion object {
        private const val STYLE_CLASS = "titled-tail" //$NON-NLS-1$
        private const val STYLE_CLASS_ENDPOINT = "titled-tail-endpoint" //$NON-NLS-1$
        private const val SIZE = 15.0
    }
}