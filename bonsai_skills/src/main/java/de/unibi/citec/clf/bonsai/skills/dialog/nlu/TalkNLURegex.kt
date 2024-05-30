package de.unibi.citec.clf.bonsai.skills.dialog.nlu

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import de.unibi.citec.clf.btl.data.speechrec.NLU
import java.io.IOException
import java.util.concurrent.Future

/**
 *  Talk using the given NLU using simple rules.
 *
 *  build message using the given intent mappings
 *
 *  example mapping: "pick_and_place=you want the #E:object from the #E:location:arrival;confirm_yes=#T what?"
 *  default mapping is "#T"
 *  variables:
 *  #M = intent mapping
 *  #I = nlu.intent
 *  #T = nlu.text
 *  #E:key = nlu.entity with key
 *
 * <pre>
 *
 * Options:
 *  #_USE_DEFAULT   [Boolean] Optional (default true)
 *                          -> use the default mapping (otherwise send error.unlisted)
 *  #_MESSAGE:      [String] Optional (default: "You said $T?")
 *                          -> Text said by the robot before waiting for confirmation
 *  #_INTENT_MAPPING:    [String[]] Optional (default: "")
 *                          -> List of intents mappings 'intent=mapping' separated by ';'
 *
 * Slots:
 *
 * ExitTokens:
 *  success.confirmYes: Received confirmation
 *  success.confirmNo:  Received denial
 *  error.timeout:    Timeout reached (only used when #_TIMEOUT is set to positive value)
 *  error.compute:    Some entity is missing or duplicate (e.g. '#E:object' while nlu has multiple object entities)
 *  error.unlisted:   The intent is not mapped (only when #_USE_DEFAULT is false)
 *
</pre> *
 *
 * @author lruegeme
 */
class TalkNLURegex : AbstractSkill() {
    private val finalReplacements = mapOf("me" to "you")
    private var message = "#M"
    private var defaultMapping = "#T"

    private var tokenSuccess: ExitToken? = null
    private var tokenErrorPsMissing: ExitToken? = null
    private var tokenErrorUnlisted: ExitToken? = null
    private var speechActuator: SpeechActuator? = null
    private var sayingComplete: Future<Void>? = null
    private var nluSlot: MemorySlotReader<NLU>? = null
    private var intentMapping: MutableMap<String, String> = HashMap()
    private var computed = false
    private var useDefault = true
    private var foundMapping = true

    private lateinit var nlu: NLU

    override fun configure(configurator: ISkillConfigurator) {
        defaultMapping = configurator.requestOptionalValue(KEY_DEFAULT_MAPPING, defaultMapping)
            .replace("""\n""".toRegex(), "")
            .replace("""\s+""".toRegex(), " ")
        useDefault = configurator.requestOptionalBool(KEY_USE_DEFAULT, useDefault)
        if(!useDefault) tokenErrorUnlisted = configurator.requestExitToken(ExitStatus.ERROR().ps("unlisted"))
        nluSlot = configurator.getReadSlot("NLUSlot", NLU::class.java)
        message = configurator.requestOptionalValue(KEY_TEXT, message)
            .replace("""\n""".toRegex(), "")
            .replace("""\s+""".toRegex(), " ")
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenErrorPsMissing = configurator.requestExitToken(ExitStatus.ERROR().ps(PS_MISSING))
        speechActuator = configurator.getActuator(ACTUATOR_SPEECHACTUATOR, SpeechActuator::class.java)

        val mappings = configurator.requestOptionalValue(KEY_MAPPING, "")
                .replace("""\n""".toRegex(), "")
                .replace("""\s+""".toRegex(), " ")

        for (m in mappings.split(";")) {
            if (m.isBlank()) continue // last string after ;
            logger.debug("add mapping: $m")
            val s = m.trim().split("=")
            if (s.size != 2) throw SkillConfigurationException("error in intentMapping for '$m' size:${s.size} != 2")
            intentMapping[s.first()] = s.last()
        }
    }

    private fun compute(text: String): String {
        val replace_intent = text.replace("#I", nlu.intent)
        val cur_text = replace_intent.replace("#T", nlu.text)
        logger.info("computing cur_text: '$cur_text'")
        val regex = "#E:([aA-zZ]*):*([aA-zZ]*)".toRegex()
        var result = cur_text.replace(regex) { match ->
            when (match.groupValues.size) {
                3 -> {
                    val key = match.groupValues[1]
                    val role = match.groupValues[2]
                    val filtered = nlu.getEntities().filter { it.key == key && it.role == role }
                    if (filtered.size != 1)
                        throw RuntimeException("${if (filtered.isEmpty()) "missing" else "multiple"} entity with key:$key role:$role")
                    filtered.first().value
                }
                else -> {
                    throw RuntimeException("unhandled match group size: ${match.groupValues.size}")
                }
            }
        }
        logger.info("computed: '$result'")
        for (replacement in finalReplacements) {
            result = result.replace(replacement.key, replacement.value)
        }
        logger.info("after final replacements: '$result'")
        return result
    }

    override fun init(): Boolean {
        nlu = nluSlot?.recall<NLU>() ?: return false
        val mapping =
            if (useDefault) intentMapping.getOrDefault(nlu.intent, defaultMapping) else intentMapping[nlu.intent]
                ?: run {
                    logger.info("intent not mapped: '${nlu.intent}'")
                    foundMapping = false
                    return true
                }
        logger.info("nlu is '${nlu}'")
        logger.info("text for ${nlu.intent} is: '$mapping'")
        message = message.replace("#M", mapping)

        return true
    }

    override fun execute(): ExitToken {
        if(!foundMapping) return tokenErrorUnlisted!!

        if (!computed) {
            try {
                message = compute(message)
            } catch (e: Exception) {
                logger.error(e.message)
                return tokenErrorPsMissing!!
            }
            computed = true
        }

        if(sayingComplete == null) {
            sayingComplete = speechActuator!!.sayAsync(message)
        }

        if(!sayingComplete!!.isDone) {
            return ExitToken.loop(50)
        }

        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }

    companion object {
        private const val KEY_MAPPING = "#_INTENT_MAPPING"
        private const val KEY_TEXT = "#_MESSAGE"
        private const val KEY_USE_DEFAULT = "#_USE_DEFAULT"
        private const val KEY_DEFAULT_MAPPING = "#_DEFAULT"

        private const val ACTUATOR_SPEECHACTUATOR = "SpeechActuator"

        private const val PS_MISSING = "compute"
    }
}
