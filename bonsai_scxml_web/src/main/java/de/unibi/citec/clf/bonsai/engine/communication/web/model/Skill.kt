package de.unibi.citec.clf.bonsai.engine.communication.web.model

import kotlinx.serialization.Serializable

@Serializable
data class SkillNames(val skills: List<String>) {}

@Serializable
data class SkillTransition(val event: String)

@Serializable
data class SkillParameter(val key: String, val required: Boolean, val default: String? = null)

@Serializable
data class SkillSlot(val key: String, val type: String)

@Serializable
data class ParameterMap(val params: Map<String, String>)

@Serializable
data class SkillInfo(
    val name: String,
    val inSlots: List<SkillSlot>,
    val outSlots: List<SkillSlot>,
    val params: List<SkillParameter>,
    val events: List<SkillTransition>
)

