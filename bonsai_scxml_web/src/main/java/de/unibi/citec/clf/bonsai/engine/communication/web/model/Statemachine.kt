package de.unibi.citec.clf.bonsai.engine.communication.web.model

import kotlinx.serialization.Serializable

@Serializable
data class LoadingResult(val success: Boolean, val messages: List<String> = listOf())

@Serializable
data class LoadData(var pathToConfig: String,
                    var pathToTask: String,
                    var includeMapping: MutableMap<String, String>,
                    var forceConfigure: Boolean)

@Serializable
data class Transitions(var transitions: List<String>)

@Serializable
data class StateIds(var ids: List<String>)