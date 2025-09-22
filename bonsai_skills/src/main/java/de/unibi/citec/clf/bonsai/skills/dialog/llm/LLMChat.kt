package de.unibi.citec.clf.bonsai.skills.dialog.llm

import de.unibi.citec.clf.bonsai.actuators.LLM
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlot
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speech.llm.Message
import de.unibi.citec.clf.btl.data.speech.llm.MessageList
import de.unibi.citec.clf.btl.data.speech.llm.Role
import de.unibi.citec.clf.btl.data.speech.llm.ToolList
import java.util.concurrent.Future

class LLMChat : AbstractSkill() {

    companion object {
        private const val KEY_TIMEOUT = "#_TIMEOUT"
        private const val KEY_BLOCKING = "#_BLOCKING"
        private const val KEY_PROMPT = "#_PROMPT"
        private const val KEY_ADD_REPLY = "#_ADD_REPLY"
        private const val KEY_STORE_MESSAGE = "#_MEMORIZE_MSG"
        private const val KEY_USE_TOOLS = "#_USE_TOOLS"
        private const val KEY_REQUIRE_TOOL = "#_REQUIRE_TOOL"
    }

    private var useTools = false
    private var requireToolUse = false
    private var memorizeMsg = false
    private var timeout = 5000L
    private var blocking = true
    private var addReply = true
    private var promt = ""

    private var fut: Future<Message?>? = null
    private var llm : LLM? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenSuccessTool: ExitToken? = null
    private var tokenErrorTimeout: ExitToken? = null
    private var tokenErrorTool: ExitToken? = null
    private var slotMsg: MemorySlotWriter<Message>? = null
    private var slot: MemorySlotWriter<String>? = null
    private var slotPrompt: MemorySlotReader<String>? = null
    private var slotHistory: MemorySlot<MessageList>? = null
    private var slotTools: MemorySlotReader<ToolList>? = null

    private var history : MessageList = MessageList()

    override fun configure(configurator: ISkillConfigurator) {
        llm = configurator.getActuator("LLM", LLM::class.java)
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()

        if(configurator.hasConfigurationKey(KEY_PROMPT)) {
            promt = configurator.requestValue(KEY_PROMPT)
        } else {
            slotPrompt = configurator.getReadSlot("prompt", String::class.java)
        }

        slotHistory = configurator.getSlot("history", MessageList::class.java)

        blocking = configurator.requestOptionalBool(KEY_BLOCKING,blocking)
        if (blocking) {
            tokenErrorTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"))
            memorizeMsg = configurator.requestOptionalBool(KEY_STORE_MESSAGE,memorizeMsg)
        }
        addReply = configurator.requestOptionalBool(KEY_ADD_REPLY,addReply)

        if (addReply && !blocking) {
            throw ConfigurationException("cant $KEY_ADD_REPLY while not blocking")
        }

        useTools = configurator.requestOptionalBool(KEY_USE_TOOLS,useTools)
        if(useTools) {
            if (!memorizeMsg) {
                logger.warn("$KEY_STORE_MESSAGE is required for tool use, automatically set to true")
                memorizeMsg = true
            }
            slotTools = configurator.getReadSlot("tools", ToolList::class.java)
            requireToolUse = configurator.requestOptionalBool(KEY_REQUIRE_TOOL, requireToolUse)
            if (requireToolUse) {
                tokenErrorTool= configurator.requestExitToken(ExitStatus.ERROR().ps("noTool"))
            }
            tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS().ps("agent"))
            tokenSuccessTool = configurator.requestExitToken(ExitStatus.SUCCESS().ps("tool"))
        } else {
            tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        }

        if(memorizeMsg) {
            slotMsg = configurator.getWriteSlot("replyMessage", Message::class.java)
        } else {
            slot = configurator.getWriteSlot("reply", String::class.java)
        }

    }

    override fun init(): Boolean {
        history = slotHistory?.recall<MessageList>() ?: history
        promt = slotPrompt?.recall<String>() ?: promt
        promt = promt.replace("\\s+".toRegex(), " ")
        val tools = slotTools?.recall<ToolList>() ?: listOf()

        val msg = Message(Role.USER, promt)
        history.add(msg)
        slotHistory?.memorize(history)
        logger.info("Sending Request '$promt'")
        fut = llm?.query(history, tools)

        if (blocking) {
            logger.debug("blocking, waiting for " + timeout + "ms")
            timeout += Time.currentTimeMillis()
        }
        return true
    }

    override fun execute(): ExitToken {
        if(!blocking) {
            /**  nonblocking, use [de.unibi.citec.clf.bonsai.skills.hack.GetLastLLMReply] to get the answer */
            return tokenSuccess!!
        }

        if(fut?.isDone == false) {
            return if (timeout < Time.currentTimeMillis()) {
                logger.debug("timeout")
                tokenErrorTimeout!!
            }
            else ExitToken.loop(50)
        }

        val reply = fut?.get() ?: Message(Role.AGENT, "")
        if (addReply) {
            history.add(reply)
            slotHistory?.memorize(history)
        }
        slot?.memorize(reply.content)
        slotMsg?.memorize(reply)

        for(msg in history) {
            logger.debug(msg)
        }

        if (useTools && reply.role == Role.TOOL_CALL) {
            logger.debug("got tool_call: ${reply.content}")
            return tokenSuccessTool!!
        } else if (requireToolUse) {
            logger.error("$KEY_REQUIRE_TOOL is set but no tool called")
            return tokenErrorTool!!
        }

        logger.debug("got reply: ${reply.content}" )
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}