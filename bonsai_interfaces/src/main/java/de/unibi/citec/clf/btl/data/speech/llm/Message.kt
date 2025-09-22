package de.unibi.citec.clf.btl.data.speech.llm

import de.unibi.citec.clf.btl.StampedType

enum class Role {
    SYSTEM,
    USER,
    AGENT,
    TOOL_CALL,
    TOOL_RESULT,
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