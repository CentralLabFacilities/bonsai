package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GTailSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GeometryUtils
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connectors.DefaultConnectorTypes
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.tail.RectangularPathCreator
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import javafx.geometry.Point2D
import javafx.scene.Group
import javafx.scene.Node
import javafx.scene.shape.Polygon
import javafx.scene.shape.Polyline
import org.apache.log4j.Logger

open class DefaultTailSkin(connector: GConnector) : GTailSkin(connector) {

    companion object {
        private val LOGGER = Logger.getLogger(DefaultTailSkin::class.java)

        private const val ENDPOINT_SIZE = 25.0

        private const val STYLE_CLASS = "default-tail"
        private const val STYLE_CLASS_ENDPOINT = "default-tail-endpoint"
    }

    protected val line = Polyline()
    protected val endpoint = Polygon()
    protected val group = Group(line, endpoint)

    init {
        performChecks()

        connector.type?.let{DefaultConnectorSkin.drawTriangleConnector(it, endpoint)}

        endpoint.styleClass.addAll(STYLE_CLASS_ENDPOINT, connector.type)
        line.styleClass.setAll(STYLE_CLASS)
        group.isManaged = false
    }

    override val root: Node
        get() = group

    override fun draw(start: Point2D?, end: Point2D?) {
        endpoint.isVisible = true
        start?.let {
            end?.let {
                layoutEndpoint(end)
                drawStupid(start, end)
            }
        }

    }

    override fun draw(start: Point2D?, end: Point2D?, target: GConnector, valid: Boolean) {
        endpoint.isVisible = false
        start?.let {
            end?.let {
                if (valid) drawSmart(start, end, target)
                else drawStupid(start, end)
            }
        }

    }

    override fun draw(start: Point2D?, end: Point2D?, jointPositions: List<Point2D>?) {
        draw(start, end)
    }

    override fun draw(start: Point2D?, end: Point2D?, jointPositions: List<Point2D>?, target: GConnector, valid: Boolean) {
        draw(start, end, target, valid)
    }

    override fun allocateJointPositions(): List<Point2D> {
        val jointPositions = mutableListOf<Point2D>()
        for (i in 2 until (line.points.size - 2) step 2) {
            val x = GeometryUtils.moveOnPixel(line.points[i])
            val y = GeometryUtils.moveOnPixel(line.points[i + 1])
            jointPositions.add(Point2D(x, y))
        }
        return jointPositions
    }

    protected open fun layoutEndpoint(position: Point2D) {
        endpoint.layoutX = GeometryUtils.moveOnPixel(position.x - ENDPOINT_SIZE / 2)
        endpoint.layoutY = GeometryUtils.moveOnPixel(position.y - ENDPOINT_SIZE / 2)
    }

    private fun performChecks() {
        item?.type?.let {
            if (!DefaultConnectorTypes.isValid(it)) {
                LOGGER.error("Connector type $it not recognized, setting to 'left-input'.")
                item.type = DefaultConnectorTypes.LEFT_INPUT
            }
        }
    }

    private fun drawStupid(start: Point2D, end: Point2D) {
        clearPoints()
        addPoint(start)

        if (DefaultConnectorTypes.getSide(item?.type)?.isVertical == true) {
            addPoint((start.x + end.x) / 2, start.y)
            addPoint((start.x + end.x) / 2, end.y)
        } else {
            addPoint(start.x, (start.y + end.y) / 2)
            addPoint(end.x, (start.y + end.y) / 2)
        }

        addPoint(end)
    }

    private fun drawSmart(start: Point2D, end: Point2D, target: GConnector) {
        clearPoints()
        addPoint(start)
        item?.let {
            DefaultConnectorTypes.getSide(item.type)?.let { startSide ->
                DefaultConnectorTypes.getSide(target.type)?.let { endSide ->
                    RectangularPathCreator.createPath(start, end, startSide, endSide).forEach { point ->
                        addPoint(point)
                    }
                }
            }
        }
        addPoint(end)

    }

    private fun clearPoints() {
        line.points.clear()
    }

    private fun addPoint(point: Point2D) {
        addPoint(point.x, point.y)
    }

    private fun addPoint(x: Double, y: Double) {
        line.points.addAll(GeometryUtils.moveOffPixel(x), GeometryUtils.moveOffPixel(y))
    }

    override fun selectionChanged(isSelected: Boolean) {
        //"Not implemented"
    }

}