package de.unibi.citec.clf.bonsai.skills.dialog.llm

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speech.llm.Message
import de.unibi.citec.clf.btl.data.speech.llm.Role

/**
 *  Load Message content into a string slot
 *
 * @author lruegeme
 */
class MessageToString : AbstractSkill() {

    private var tokenSuccess: ExitToken? = null
    private var messageSlot: MemorySlotReader<Message>? = null
    private var textSlot: MemorySlotWriter<String>? = null


    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        messageSlot = configurator.getReadSlot("Message", Message::class.java)
        textSlot = configurator.getWriteSlot("Text", String::class.java)
    }

    override fun init(): Boolean {
        val message = messageSlot?.recall<Message>() ?: run {
            logger.error("slot is empty")
            return false
        }
        if (message.role != Role.AGENT) {
            logger.fatal("message role is ${message.role} != ${Role.AGENT}")
            return false
        }
        val text = message.content
        textSlot?.memorize(text)
        return true
    }

    override fun execute(): ExitToken {
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }


}
