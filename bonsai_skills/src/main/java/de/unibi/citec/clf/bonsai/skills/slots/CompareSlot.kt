package de.unibi.citec.clf.bonsai.skills.slots

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator

/**
 * Read from ReadSlot and compare to given regex. String read from slot is getting formated to lower case before
 * comparing.
 *
 * <pre>
 *
 *
 * Options:
 * #_COMPARE_STRING:         [String]
 *  -> Regex used for comparing
 *
 * Slots:
 * ReadSlot: [String] [Read]
 *  -> Memory slot the content will be read from
 *
 *
 *
 * ExitTokens:
 * success.match:      Regex matched
 * success.mismatch:   Regex didn't match
 * error:              ReadSlot was empty
 *
 * Sensors:
 *
 * Actuators:
 *
</pre> *
 *
 * @author nschmitz
 */
class CompareSlot : AbstractSkill() {
    private lateinit var tokenMisMatch: ExitToken
    private lateinit var tokenMatch: ExitToken

    private var readSlot: MemorySlotReader<String?>? = null

    private var slotContent: String? = null
    private var comparePattern: String? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenMatch = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("match"))
        tokenMisMatch = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("misMatch"))


        readSlot = configurator.getReadSlot("ReadSlot", String::class.java)
        comparePattern = configurator.requestValue(KEY_COMPARE_STRING)
    }

    override fun init(): Boolean {
        try {
            slotContent = readSlot?.recall<String?>()

            if (slotContent == null) {
                logger.warn("your ReadSlot was empty")
                return false
            }
        } catch (ex: CommunicationException) {
            logger.fatal("Unable to read from memory: ", ex)
            return false
        }
        if (comparePattern == "'" || comparePattern!!.isEmpty() || comparePattern!!.isBlank()) {
            logger.warn("Your Regex Pattern is empty. Defaulting to match.")
        }
        return true
    }

    override fun execute(): ExitToken {
        val sanitizedSlotContent = slotContent?.lowercase() ?: "unknown"
        logger.debug("Trying to match regex '$comparePattern' with slot-content '$sanitizedSlotContent'")
        if (comparePattern?.toRegex()?.matches(sanitizedSlotContent) ?: true) {
            return tokenMatch
        }
        return tokenMisMatch
    }

    override fun end(curToken: ExitToken?): ExitToken? {
        return curToken
    }

    companion object {
        // Name of option could be better, its terrible right now
        private const val KEY_COMPARE_STRING = "#_COMPARE_STRING"
    }
}
