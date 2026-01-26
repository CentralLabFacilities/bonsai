package de.unibi.citec.clf.btl.data.speech.llm

import de.unibi.citec.clf.btl.StampedType

enum class Role(val code: Int) {
    SYSTEM(0),
    USER(1),
    AGENT(2),
    TOOL_CALL(3),
    TOOL_RESULT(4);

    fun toInt() = code

    companion object {
        private val codeToStatus = entries.associateBy { it.code }
        fun fromCode(code: Int): Role? = codeToStatus[code]
        fun fromCodeStrict(code: Int): Role = codeToStatus[code] ?: throw IllegalArgumentException("Unknown status code: $code")
    }
}

open class Message(var role: Role, var content: String) : StampedType(), Cloneable {

    override fun clone(): Message {
        return Message(role,content)
    }
    constructor(e: Message) : this(e.role, e.content, ) {
        frameId = e.frameId
        timestamp = e.timestamp
    }

    override fun toString(): String {
        return "$role: $content"
    }


}