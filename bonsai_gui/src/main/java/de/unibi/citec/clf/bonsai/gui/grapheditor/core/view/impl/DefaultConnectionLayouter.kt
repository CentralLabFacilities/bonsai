package de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.impl

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectionSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.ConnectionLayouter
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import javafx.geometry.Point2D
import org.apache.log4j.BasicConfigurator
import org.apache.log4j.Logger

/**
 * Default implementation of {@link ConnectionLayouter}
 */
class DefaultConnectionLayouter(private val skinLookup: SkinLookup) : ConnectionLayouter {

    companion object {
        private val LOGGER = Logger.getLogger(DefaultConnectionLayouter::class.java)
    }

    init {
        BasicConfigurator.configure();
    }

    private lateinit var model: GModel

    override fun initialize(model: GModel) {
        this.model = model
    }

    override fun draw() {
        if (model.connections.isEmpty()) return
        try {
            redrawAllConnections()
        } catch (e: Exception) {
            LOGGER.debug("Could not redraw Connections: ", e)
        }
    }

    private fun redrawAllConnections() {
        val connectionPoints: MutableMap<GConnectionSkin, MutableList<Point2D>> = mutableMapOf()
        for (connection in model.connections) {
            connection?.let { con ->
                skinLookup.lookupConnection(con)?.let { connectionSkin ->
                    connectionSkin.update()?.let { points ->
                        connectionPoints.put(connectionSkin, points.toMutableList())
                    }
                }
            }
        }

        for (skin in connectionPoints.keys) {
            skin.draw(connectionPoints)
        }
    }
}