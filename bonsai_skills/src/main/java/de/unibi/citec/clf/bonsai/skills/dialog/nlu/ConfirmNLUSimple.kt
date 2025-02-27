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
import de.unibi.citec.clf.bonsai.util.helper.SimpleNLUHelper
import de.unibi.citec.clf.btl.data.speechrec.Language
import de.unibi.citec.clf.btl.data.speechrec.LanguageType
import de.unibi.citec.clf.btl.data.speechrec.NLU
import java.io.IOException
import java.util.concurrent.Future

/**
 * Wait for confirmation by a speech command using NLU.
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
 *  #_INTENT_NO:    [String] Optional (default: "confirm_no")
 *                          -> Name of intent that signals no
 *  #_INTENT_YES:   [String] Optional (default: "confirm_yes")
 *                          -> Name of intent that signals yes
 *
 * Slots:
 *
 * ExitTokens:
 *  success.confirmYes: Received confirmation
 *  success.confirmNo:  Received denial
 *  success.timeout:    Timeout reached (only used when #_TIMEOUT is set to positive value)
 *
</pre> *
 *
 * @author lruegeme
 */
@Deprecated("superseded, use ConfirmNLURegex without mappings", ReplaceWith("ConfirmNLURegex"))
class ConfirmNLUSimple : AbstractSkill(), SensorListener<NLU?> {
    private var confirmText = "You said: \$T ?"
    private var timeout: Long = -1
    private var timeUntilRepeat: Long = 5000
    private var maxRepeats = 1
    private var intentNo = "confirm_no"
    private var intentYes = "confirm_yes"
    private var tokenSuccessPsTimeout: ExitToken? = null
    private var tokenSuccessPsYes: ExitToken? = null
    private var tokenSuccessPsNo: ExitToken? = null
    private var helper: SimpleNLUHelper? = null
    private var speechSensor: Sensor<NLU>? = null
    private var speechActuator: SpeechActuator? = null
    private var nextRepeat: Long = 0
    private var timesAsked = 0
    private var sayingComplete: Future<String?>? = null
    private var nluSlot: MemorySlotReader<NLU>? = null
    private var langSlot: MemorySlotReader<LanguageType>? = null
    private var lang: Language = Language.EN

    override fun configure(configurator: ISkillConfigurator) {
        nluSlot = configurator.getReadSlot<NLU>("NLUSlot", NLU::class.java)
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()
        timeUntilRepeat = configurator.requestOptionalInt(KEY_REPEAT, timeUntilRepeat.toInt()).toLong()
        maxRepeats = configurator.requestOptionalInt(KEY_MAXREP, maxRepeats)
        confirmText = configurator.requestOptionalValue(KEY_TEXT, confirmText)
        intentNo = configurator.requestOptionalValue(KEY_INTENT_NO, intentNo)
        intentYes = configurator.requestOptionalValue(KEY_INTENT_YES, intentYes)
        tokenSuccessPsYes = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_YES))
        tokenSuccessPsNo = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_NO))
        if (timeout > 0) {
            tokenSuccessPsTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps(PS_TIMEOUT))
        }
        speechSensor = configurator.getSensor<NLU>(SENSOR_NLU, NLU::class.java)
        speechActuator = configurator.getActuator<SpeechActuator>(ACTUATOR_SPEECHACTUATOR, SpeechActuator::class.java)
        if (configurator.requestOptionalBool(KEY_USE_LANGUAGE, true)) {
            langSlot = configurator.getReadSlot("Language", LanguageType::class.java)
        }
    }

    override fun init(): Boolean {
        lang  = langSlot?.recall<LanguageType>()?.value ?: Language.EN
        if (timeout > 0) {
            logger.debug("using timeout of $timeout ms")
            timeout += Time.currentTimeMillis()
        }
        helper = SimpleNLUHelper(speechSensor, true)
        helper!!.startListening()

        val nlu = nluSlot?.recall<NLU>() ?: return false
        confirmText = confirmText.replace("\$T", nlu.text)
        return true
    }

    override fun execute(): ExitToken {
        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
                logger.info("ConfirmYesOrNo timeout")
                return tokenSuccessPsTimeout!!
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
                return ExitToken.loop(50)
            } else {
                sayingComplete = null
                helper!!.startListening()
            }
        }

        // Ask Again
        if (Time.currentTimeMillis() > nextRepeat) {
            if (timesAsked++ < maxRepeats) {
                try {
                    sayingComplete = speechActuator!!.sayTranslated(confirmText, lang)
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
                sayingComplete = speechActuator!!.sayTranslated("Please answer with yes or no!", lang)
            } catch (ex: IOException) {
                logger.error("IO Exception in speechActuator")
            }
        }
        return ExitToken.loop(50)
    }

    override fun newDataAvailable(nluEntities: NLU?) {}

    companion object {
        private const val KEY_USE_LANGUAGE = "#_USE_LANGUAGE"
        private const val KEY_TEXT = "#_MESSAGE"
        private const val KEY_TIMEOUT = "#_TIMEOUT"
        private const val KEY_REPEAT = "#_REPEAT_AFTER"
        private const val KEY_MAXREP = "#_REPEATS"
        private const val KEY_INTENT_NO = "#_INTENT_NO"
        private const val KEY_INTENT_YES = "#_INTENT_YES"

        private const val ACTUATOR_SPEECHACTUATOR = "SpeechActuator"
        private const val SENSOR_NLU = "NLUSensor"

        private const val PS_TIMEOUT = "timeout"
        private const val PS_NO = "confirmNo"
        private const val PS_YES = "confirmYes"
    }
}
