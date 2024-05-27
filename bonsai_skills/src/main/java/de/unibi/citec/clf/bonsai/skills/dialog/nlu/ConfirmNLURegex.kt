package de.unibi.citec.clf.bonsai.skills.dialog.nlu

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
import de.unibi.citec.clf.bonsai.core.SensorListener
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.Sensor
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import de.unibi.citec.clf.bonsai.util.helper.SimpleNLUHelper
import de.unibi.citec.clf.btl.data.speechrec.NLU
import java.io.IOException
import java.util.concurrent.Future

/**
 * Wait for confirmation of an understood NLU using simple rules.
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
 *  #_MESSAGE:      [String] Optional (default: "You said $T?")
 *                          -> Text said by the robot before waiting for confirmation
 *  #_TIMEOUT       [long] Optional (default: -1)
 *                          -> Amount of time robot waits for confirmation in ms
 *  #_REPEAT_AFTER: [long] Optional (default: 5000)
 *                          -> Time between the robot asking #_TEXT again in ms
 *  #_REPEATS:      [int] Optional (default: 1)
 *                          -> Amount of times #_TEXT is asked
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
 *
</pre> *
 *
 * @author lruegeme
 */
class ConfirmNLURegex : AbstractSkill(), SensorListener<NLU?> {
    private val finalReplacements = mapOf("me" to "you")
    private var confirmText = "You want Me to: #M?"
    private var defaultMapping = "#T"
    private var timeout: Long = -1
    private var timeUntilRepeat: Long = 5000
    private var maxRepeats = 1
    private var intentNo = "confirm_no"
    private var intentYes = "confirm_yes"
    private var speechSensorName = "NLUSensor"
    private var tokenErrorPsTimeout: ExitToken? = null
    private var tokenSuccessPsYes: ExitToken? = null
    private var tokenSuccessPsNo: ExitToken? = null
    private var tokenErrorPsMissing: ExitToken? = null
    private var helper: SimpleNLUHelper? = null
    private var speechSensor: Sensor<NLU>? = null
    private var speechActuator: SpeechActuator? = null
    private var nextRepeat: Long = 0
    private var timesAsked = 0
    private var sayingComplete: Future<Void>? = null
    private var nluSlot: MemorySlotReader<NLU>? = null
    private var intentMapping: MutableMap<String, String> = HashMap()
    private var computed = false

    private lateinit var nlu: NLU

    override fun configure(configurator: ISkillConfigurator) {
        nluSlot = configurator.getReadSlot("NLUSlot", NLU::class.java)
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()
        timeUntilRepeat = configurator.requestOptionalInt(KEY_REPEAT, timeUntilRepeat.toInt()).toLong()
        maxRepeats = configurator.requestOptionalInt(KEY_MAXREP, maxRepeats)
        confirmText = configurator.requestOptionalValue(KEY_TEXT, confirmText)
        intentNo = configurator.requestOptionalValue(KEY_INTENT_NO, intentNo)
        intentYes = configurator.requestOptionalValue(KEY_INTENT_YES, intentYes)
        speechSensorName = configurator.requestOptionalValue(KEY_SPEECH_SENSOR, speechSensorName)
        tokenSuccessPsYes = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_YES))
        tokenSuccessPsNo = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_NO))
        if (timeout > 0) {
            tokenErrorPsTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps(PS_TIMEOUT))
        }
        tokenErrorPsMissing = configurator.requestExitToken(ExitStatus.ERROR().ps(PS_MISSING))
        speechSensor = configurator.getSensor<NLU>(speechSensorName, NLU::class.java)
        speechActuator = configurator.getActuator<SpeechActuator>(ACTUATOR_SPEECHACTUATOR, SpeechActuator::class.java)

        val mappings = configurator.requestOptionalValue(KEY_MAPPING, "")
                .replace("""\n""".toRegex(), "")
                .replace("""\s+""".toRegex(), " ")

        for (m in mappings.split(";")) {
            if (m.isEmpty()) continue // last string after ;
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
        if (timeout > 0) {
            logger.debug("using timeout of $timeout ms")
            timeout += Time.currentTimeMillis()
        }
        helper = SimpleNLUHelper(speechSensor, true)
        helper!!.startListening()

        nlu = nluSlot?.recall<NLU>() ?: return false
        val mapping = intentMapping.getOrDefault(nlu.intent, defaultMapping)
        logger.info("nlu is '${nlu}'")
        logger.info("confirmText for ${nlu.intent} is: '$mapping'")
        confirmText = confirmText.replace("#M", mapping)
        return true
    }

    override fun execute(): ExitToken {
        if (!computed) {
            try {
                confirmText = compute(confirmText)
            } catch (e: Exception) {
                logger.error(e.message)
                return tokenErrorPsMissing!!
            }
            computed = true
        }

        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
                logger.info("ConfirmYesOrNo timeout")
                return tokenErrorPsTimeout!!
            }
        }
        return confirmYesNo()!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        speechSensor!!.removeSensorListener(this)
        return curToken
    }

    private fun confirmYesNo(): ExitToken? {
        if (sayingComplete != null) {
            if (!sayingComplete!!.isDone) {
                helper!!.startListening()
                return ExitToken.loop(50)
            }
        }

        // Ask Again
        if (Time.currentTimeMillis() > nextRepeat) {
            if (timesAsked++ < maxRepeats) {
                try {
                    sayingComplete = speechActuator!!.sayAsync(confirmText)
                } catch (ex: IOException) {
                    logger.error("IO Exception in speechActuator")
                }
                nextRepeat = Time.currentTimeMillis() + timeUntilRepeat
                return ExitToken.loop(50)
            }
        }

        // Loop if no new Understandings
        if (helper!!.hasNewUnderstanding()) {
            if (helper!!.allUnderstoodIntents.contains(intentYes)) {
                return tokenSuccessPsYes
            } else if (helper!!.allUnderstoodIntents.contains(intentNo)) {
                return tokenSuccessPsNo
            }
            try {
                sayingComplete = speechActuator!!.sayAsync("Sorry, please repeat!")
            } catch (ex: IOException) {
                logger.error("IO Exception in speechActuator")
            }
        }
        return ExitToken.loop(50)
    }

    override fun newDataAvailable(nluEntities: NLU?) {}

    companion object {
        private const val KEY_MAPPING = "#_INTENT_MAPPING"
        private const val KEY_TEXT = "#_MESSAGE"
        private const val KEY_TIMEOUT = "#_TIMEOUT"
        private const val KEY_REPEAT = "#_REPEAT_AFTER"
        private const val KEY_MAXREP = "#_REPEATS"

        private const val KEY_INTENT_NO = "#_INTENT_NO"
        private const val KEY_INTENT_YES = "#_INTENT_YES"
        private const val KEY_SPEECH_SENSOR = "#_SPEECH_SENSOR"

        private const val ACTUATOR_SPEECHACTUATOR = "SpeechActuator"
        private const val PS_TIMEOUT = "timeout"
        private const val PS_MISSING = "compute"
        private const val PS_NO = "confirmNo"
        private const val PS_YES = "confirmYes"
    }
}
