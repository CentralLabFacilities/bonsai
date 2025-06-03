package de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GConnectorValidator
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connectors.DefaultConnectorTypes
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector

/**
 * Default validation rules that determine which connectors can be connected to each other.
 */
class DefaultConnectorValidator: GConnectorValidator {

    override fun prevalidate(
        source: GConnector?,
        target: GConnector?
    ): Boolean {
        return if (source == null || target == null) false
        else if (source == target) false
        else true
    }

    override fun validate(
        source: GConnector?,
        target: GConnector?
    ): Boolean {
        if (source?.type == null || target?.type == null) {
            return false
        } else if (!source.connections.isEmpty() || !target.connections.isEmpty()) {
            return false
        } else if (source.parent?.equals(target.parent) ?: false) {
            return false
        }
        val sourceIsInput: Boolean = source.type?.let {DefaultConnectorTypes.isInput(it)} ?: false
        val targetIsInput: Boolean = target.type?.let {DefaultConnectorTypes.isInput(it)} ?: false
        return sourceIsInput != targetIsInput
    }

    override fun createConnectionType(
        source: GConnector?,
        target: GConnector?
    ): String? {
        return "PLACEHOLDER"
    }

    override fun createJointType(
        source: GConnector?,
        target: GConnector?
    ): String? {
        return "PLACEHOLDER"
    }
}