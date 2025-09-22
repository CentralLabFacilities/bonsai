package de.unibi.citec.clf.bonsai.skills.dialog.llm

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlot
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speech.llm.Tool
import de.unibi.citec.clf.btl.data.speech.llm.ToolList
import de.unibi.citec.clf.btl.data.speech.llm.ToolParameter

class AddTool : AbstractSkill() {

    companion object {
        private const val KEY_NAME = "#_NAME"
        private const val KEY_DESCRIPTION = "#_DESCRIPTION"
        private const val KEY_PARAM_PREFIX = "#_PARAM_"
    }

    private var tokenSuccess: ExitToken? = null
    private var slotTools: MemorySlot<ToolList>? = null
    private var tools: ToolList = ToolList()

    private var name = ""
    private var desc = ""
    private var params: MutableList<ToolParameter> = mutableListOf()

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        slotTools = configurator.getSlot("tools", ToolList::class.java)

        name = configurator.requestValue(KEY_NAME).replace("[^\\S\\r\\n]+".toRegex(), " ")
        desc = configurator.requestOptionalValue(KEY_DESCRIPTION, desc)

        params.clear()
        for (key in configurator.configurationKeys) {
            if (!key.startsWith(KEY_PARAM_PREFIX)) continue
            val paramName = key.removePrefix(KEY_PARAM_PREFIX)

            var description = configurator.requestValue(key).replace("[^\\S\\r\\n]+".toRegex(), " ")
            var required = false
            if (description.startsWith("!")) {
                description = description.removePrefix("!")
                required = true
            }
            params.add(ToolParameter(paramName, description, required))
        }

    }

    override fun init(): Boolean {
        tools = slotTools?.recall<ToolList>() ?: tools
        tools.add(Tool(name, desc, params))
        logger.debug("added tool: ${tools.last()}")
        slotTools?.memorize(tools)
        return true
    }

    override fun execute(): ExitToken {
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}