package de.unibi.citec.clf.bonsai.skills.dialog.llm

import com.beust.klaxon.JsonObject
import com.beust.klaxon.Parser
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speech.llm.Message
import de.unibi.citec.clf.btl.data.speech.llm.Role
import de.unibi.citec.clf.btl.data.speech.NLU
import de.unibi.citec.clf.btl.data.speech.NLUEntity
import java.lang.StringBuilder

/**
 *
 * @author lruegeme
 */
class ToolToNLU : AbstractSkill() {

    companion object {
        private const val KEY_SPLIT_KEYS = "#_SPLIT_PARAMETER"
    }

    private var splitParameterRole = true
    private var messageSlot: MemorySlotReader<Message>? = null
    private var nluSlot: MemorySlotWriter<NLU>? = null
    private var tokenSuccess: ExitToken? = null

    override fun configure(configurator: ISkillConfigurator) {
        splitParameterRole = configurator.requestOptionalBool(KEY_SPLIT_KEYS,splitParameterRole)
        nluSlot = configurator.getWriteSlot("NLUSlot", NLU::class.java)
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        messageSlot = configurator.getReadSlot("replyMessage", Message::class.java)
    }

    override fun init(): Boolean {
        val msg = messageSlot?.recall<Message>() ?: run {
            logger.fatal("Message is empty")
            return false
        }
        if(msg.role != Role.TOOL_CALL) {
            logger.fatal("message role is ${msg.role} != ${Role.TOOL_CALL}")
            return false
        }

        val parser: Parser = Parser.default()

        logger.trace("have json: ${msg.content}")
        val fixups = msg.content.replace("'{","{" )
                .replace("}'","}" )
                .replace("'","\"")
        logger.trace("have fixups: $fixups")

        val json: JsonObject = parser.parse(StringBuilder(fixups)) as JsonObject
        val intent = json.obj("function")?.string("name") ?: run {
            logger.fatal("error parsing tool_call")
            logger.debug(json.toString())
            return false
        }

        val params = json.obj("function")?.obj("arguments")?.map ?: run {
            logger.fatal("error parsing tool_call params")
            logger.debug(json.toString())
            return false
        }

        logger.info("ToolCall function name: $intent")
        val entities : MutableList<NLUEntity> = mutableListOf()
        for (kv in params.entries) {
            val value = kv.value.toString()
            // Skip NONE values
            if (value in setOf("NONE","None","none")) {
                logger.debug("skipped parameter: ${kv.key}")
                continue
            }
            logger.debug("- param '${kv.key}' is '$value'")
            var key = kv.key
            var role: String? = null
            if (splitParameterRole) {
                val split = key.split("_")
                key = split.first()
                role = split.getOrNull(1)
            }
            entities.add(NLUEntity(key, value, role, null))
        }

        val nlu = NLU("", intent, 1.0f, entities)
        nluSlot?.memorize(nlu)
        logger.debug("memorized: $nlu")
        return true
    }

    override fun execute(): ExitToken {
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }




}
