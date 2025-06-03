package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorValidator
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector

/**
 * Validation rules for how connectors can be connected for the 'tree-like' graph.
 */
class TreeConnectorValidator : GConnectorValidator {
    override fun prevalidate(source: GConnector?, target: GConnector?): Boolean {
        if (source == null || target == null) {
            return false
        } else if (source == target) {
            return false
        }
        return true
    }

    override fun validate(source: GConnector?, target: GConnector?): Boolean {
        if (source!!.type == null || target!!.type == null) {
            return false
        } else if (source.parent == target.parent) {
            return false
        } else if (source.type == target.type) {
            return false
        } else if (source.type == TreeSkinConstants.TREE_INPUT_CONNECTOR && !source.connections.isEmpty()) {
            return false
        } else if (target.type == TreeSkinConstants.TREE_INPUT_CONNECTOR && !target.connections.isEmpty()) {
            return false
        }
        return true
    }

    override fun createConnectionType(source: GConnector?, target: GConnector?): String? {
        return TreeSkinConstants.TREE_CONNECTION
    }

    override fun createJointType(source: GConnector?, target: GConnector?): String? {
        return null
    }
}