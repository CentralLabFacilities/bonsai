package de.unibi.citec.clf.bonsai.skills.dialog.llm

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlot
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speech.llm.Message
import de.unibi.citec.clf.btl.data.speech.llm.MessageList
import de.unibi.citec.clf.btl.data.speech.llm.Role

/**
 * Add a system prompt to a conversation history.
 *
 * <pre>
 *
 * Options:
 * #_PROMPT              [String] Required
 *      -> The system prompt that shall be added to the conversation history.
 *
 * Slots:
 * history: [MessageList] (Read, Write)
 *      -> Memory slot containing the conversation history.
 *      -> The system prompt is added as a SYSTEM message to this history.
 *
 * ExitTokens:
 * success:               System prompt successfully added to the history
 * </pre>
 *
 * @author
 */

class AddSystemPrompt : AbstractSkill() {

    companion object {
        private const val KEY_PROMPT = "#_PROMPT"
    }

    private var promt = ""

    private var tokenSuccess: ExitToken? = null
    private var slotHistory: MemorySlot<MessageList>? = null
    private var history : MessageList = MessageList()

    override fun configure(configurator: ISkillConfigurator) {
        promt = configurator.requestValue(KEY_PROMPT)

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        slotHistory = configurator.getSlot("history", MessageList::class.java)

    }

    override fun init(): Boolean {
        history = slotHistory?.recall<MessageList>() ?: history

        if (history.isNotEmpty()) {
            logger.error("History not empty, will not add system prompt")
            return false
        }

        promt = promt.replace("[^\\S\\r\\n]+".toRegex(), " ")
        val msg = Message(Role.SYSTEM, promt)
        logger.debug("Added: $msg")

        history.add(msg)
        slotHistory?.memorize(history)

        return true
    }

    override fun execute(): ExitToken {
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}