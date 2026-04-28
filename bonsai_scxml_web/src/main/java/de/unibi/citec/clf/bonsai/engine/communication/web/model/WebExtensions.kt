package de.unibi.citec.clf.bonsai.engine.communication.web.model

import kotlinx.serialization.Serializable

@Serializable
data class BonsaiScxml(val scxml: String) {
    val encoding: String = "base64"
}

@Serializable
data class BonsaiConfig(val xml: String) {
    val encoding: String = "base64"
}

@Serializable
data class StatemachineConfig(val statemachine: BonsaiScxml, val config: BonsaiConfig, val forceLoad: Boolean = false)

