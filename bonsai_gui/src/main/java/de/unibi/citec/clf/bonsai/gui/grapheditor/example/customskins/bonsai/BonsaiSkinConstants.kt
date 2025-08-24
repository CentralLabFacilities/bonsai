package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.bonsai

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.ExitStatus
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.TransitionType
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.exceptions.IllegalBonsaiTypeUsageException

object BonsaiSkinConstants {
    const val BONSAI_NODE = "bonsai-node"
    const val BONSAI_INBOUND_CONNECTOR = "bonsai-connector-inbound"
    const val BONSAI_OUTBOUND_SUCCESS_CONNECTOR = "bonsai-connector-outbound-success"
    const val BONSAI_OUTBOUND_ERROR_CONNECTOR = "bonsai-connector-outbound-error"
    const val BONSAI_OUTBOUND_FATAL_CONNECTOR = "bonsai-connector-outbound-fatal"
    const val BONSAI_CONNECTION_SUCCESS = "bonsai-connection-success"
    const val BONSAI_CONNECTION_ERROR = "bonsai-connection-error"
    const val BONSAI_CONNECTION_FATAL = "bonsai-connection-fatal"

    fun fromTransitionType(transitionType: ExitStatus.Status): String {
        return when (transitionType) {
            ExitStatus.Status.SUCCESS -> BONSAI_OUTBOUND_SUCCESS_CONNECTOR
            ExitStatus.Status.ERROR -> BONSAI_OUTBOUND_ERROR_CONNECTOR
            ExitStatus.Status.FATAL -> BONSAI_CONNECTION_FATAL
        }
    }
}