package de.unibi.citec.clf.bonsai.gui.grapheditor.utils

import javafx.geometry.Point2D
import javafx.scene.Node
import javafx.scene.input.MouseEvent
import javafx.scene.layout.Region

class BonsaiGeometryUtils {

    companion object {
        const val HALF_A_PIXEL: Double = 0.5

        fun getConnectorPosition(connector: GConnector, skinLookup: SkinLookup): Point2D? {
            val connectorSkin: GConnectorSkin = skinLookup.lookupConnector(connector)
            val parent: GNode = connector.parent
            val nodeSkin: GNodeSkin = skinLookup.lookupNode(parent)
            if (nodeSkin == null) {
                return null
            }

            nodeSkin.layoutConnectors()

            val nodeX: Double = nodeSkin.getRoot().layoutX
            val nodeY: Double = nodeSkin.getRoot().layoutY

            val connectorPosition: Point2D = nodeSkin.connectorPosition(connectorSkin)

            val connectorX: Double = connectorPosition.x
            val connectorY: Double = connectorPosition.y

            return Point2D(moveOnPixel(nodeX + connectorX), moveOnPixel(nodeY + connectorY))
        }

        fun getCursorPosition(event: MouseEvent, node: Node): Point2D {
            val sceneX: Double = event.sceneX
            val sceneY: Double = event.sceneY
            val containerScene: Point2D = node.localToScene(0.0, 0.0)
            return Point2D(sceneX - containerScene.x, sceneY - containerScene.y)
        }

        fun getJointPositions(jointSkins: List<GJointSkin>): List<Point2D> {
            val jointPositions: MutableList<Point2D> = MutableList<Point2D>(jointSkins.size)
            for (jointSkin in jointSkins) {
                val region: Region = jointSkin.root
                val x: Double = region.layoutX + jointSkin.width / 2
                val y: Double = region.layoutY + jointSkin.height / 2
                jointPositions.add(Point2D(x, y))
            }
            return jointPositions
        }

        fun fillJointPositions(connection: GConnection, skinLookup: SkinLookup, target: Point2D[]) {
            for ()
        }
    }


}