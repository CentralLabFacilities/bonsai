package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GJoint
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import javafx.util.Callback


/**
 * Provides functionality for customizing the display of the graph elements.
 */
interface GraphEditorSkins {
    /**
     * Custom node skin factory.
     */
    var nodeSkinFactory: Callback<GNode, GNodeSkin>

    /**
     * Custom connector skin factory.
     */
    var connectorSkinFactory: Callback<GConnector, GConnectorSkin>

    /**
     * Custom connection skin factory.
     */
    var connectionSkinFactory: Callback<GConnection, GConnectionSkin>

    /**
     * Custom joint skin factory.
     */
    var jointSkinFactory: Callback<GJoint, GJointSkin>

    /**
     * Custom tail skin factory.
     */
    var tailSkinFactory: Callback<GConnector, GTailSkin>
}