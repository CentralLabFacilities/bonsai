package de.unibi.citec.clf.btl.data.speech.llm

import de.unibi.citec.clf.btl.Type

open class ToolParameter(var name: String, var description: String?, var required: Boolean = false) : Cloneable{
    override fun clone(): ToolParameter {
        return ToolParameter(name,description, required)
    }
}

open class Tool(
        var name: String,
        var description: String? = null,
) : Type(), Cloneable {
    val parameters: MutableList<ToolParameter> = ArrayList()

    override fun clone(): Tool {
        return Tool(name,description).also { it.parameters.addAll(parameters) }
    }

    constructor(name:String, description: String?, parameters: List<ToolParameter>) : this(name, description) {
        this.parameters.addAll(parameters)
    }

    constructor(e: Tool) : this(e.name, e.description) {
        parameters.addAll(e.parameters)
    }

    override fun toString(): String {
        val params = parameters.joinToString(separator = "; ") { param ->
            "${param.name} (${param.description})"
        }
        return "Tool: $name ($description) $params"
    }


}