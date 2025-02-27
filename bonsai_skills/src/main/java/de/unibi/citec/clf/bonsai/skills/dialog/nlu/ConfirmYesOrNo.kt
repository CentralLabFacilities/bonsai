package de.unibi.citec.clf.bonsai.skills.dialog.nlu

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
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
 *  #_MESSAGE:             [String] Optional (default: "Was that correct?")
 *                          -> Text said by the robot before waiting for confirmation
 *  #_USESIMPLE:        [boolean] Optional (default: true)
 *                          -> If true: the robot only listens for confirmation (no talks)
 *  #_TIMEOUT           [long] Optional (default: -1)
 *                          -> Amount of time robot waits for confirmation in ms
 *  #_REPEAT_AFTER:     [long] Optional (default: 5000)
 *                          -> Time between the robot asking #_TEXT again in ms
 *  #_REPEATS:          [int] Optional (default: 1)
 *                          -> Amount of times #_TEXT is asked
 *  #_INTENT_NO:   [String] Optional (default: "confirm_no")
 *                          -> Name of intent that signals no
 *  #_INTENT_YES:  [String] Optional (default: "confirm_yes")
 *                          -> Name of intent that signals yes
 *  #_SPEECH_SENSOR:    [String] Optional (default: "NLUSensor")
 *                          -> Which sensor to use for new understandings
 *  #_USE_LANGUAGE: [Boolean] Optional (default: false)
 *                          -> Read Language slot to determine speak language else it defaults to "EN"
 *
 * Slots:
 *
 * ExitTokens:
 *  success.confirmYes: Received confirmation
 *  success.confirmNo:  Received denial
 *  success.timeout:    Timeout reached (only used when #_TIMEOUT is set to positive value)
 *
 * Sensors:
 *  #_SPEECH_SENSOR: [NLU]
 *      -> Used to listen for confirmation
 *
 * Actuators:
 *  SpeechActuator: [SpeechActuator]
 *      -> Used to ask #_TEXT for confirmation
 *
 * </pre>
 *
 * @author hterhors, prenner, lkettenb, ssharma, lruegeme, nschmitz
 * @author rfeldhans
 * @author jkummert
 */
class ConfirmYesOrNo : AbstractSkill() {
    private var confirmText = "Was that correct?"
    private var simpleYesOrNo = true
    private var timeout: Long = -1
    private var timeUntilRepeat: Long = 5000
    private var maxRepeats = 1
    private var intentNo = "confirm_no"
    private var intentYes = "confirm_yes"
    private var speechSensorName = "NLUSensor"
    private var tokenSuccessPsTimeout: ExitToken? = null
    private var tokenSuccessPsYes: ExitToken? = null
    private var tokenSuccessPsNo: ExitToken? = null
    private var helper: SimpleNLUHelper? = null
    private var speechSensor: Sensor<NLU>? = null
    private var speechActuator: SpeechActuator? = null
    private var nextRepeat: Long = 0
    private var timesAsked = 0
    private var sayingComplete: Future<String?>? = null
    private var langSlot: MemorySlotReader<LanguageType>? = null

    override fun configure(configurator: ISkillConfigurator) {
        if (configurator.requestOptionalBool(KEY_USE_LANGUAGE, true)) {
            langSlot = configurator.getReadSlot("Language", LanguageType::class.java)
        }

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()
        simpleYesOrNo = configurator.requestOptionalBool(KEY_SIMPLE, simpleYesOrNo)
        timeUntilRepeat = configurator.requestOptionalInt(KEY_REPEAT, timeUntilRepeat.toInt()).toLong()
        maxRepeats = configurator.requestOptionalInt(KEY_MAXREP, maxRepeats)
        confirmText = configurator.requestOptionalValue(KEY_TEXT, confirmText)
        intentNo = configurator.requestOptionalValue(KEY_INTENT_NO, intentNo)
        intentYes = configurator.requestOptionalValue(KEY_INTENT_YES, intentYes)
        speechSensorName = configurator.requestOptionalValue(KEY_SPEECH_SENSOR, speechSensorName)
        tokenSuccessPsYes = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_YES))
        tokenSuccessPsNo = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_NO))
        if (timeout > 0) {
            tokenSuccessPsTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps(PS_TIMEOUT))
        }
        speechSensor = configurator.getSensor(speechSensorName, NLU::class.java)
        speechActuator = configurator.getActuator(ACTUATOR_SPEECHACTUATOR, SpeechActuator::class.java)
    }

    override fun init(): Boolean {
        if (timeout > 0) {
            logger.debug("using timeout of $timeout ms")
            timeout += Time.currentTimeMillis()
        }
        helper = SimpleNLUHelper(speechSensor, true)
        helper!!.startListening()
        return true
    }

    override fun execute(): ExitToken {
        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
                logger.info("ConfirmYesOrNo timeout")
                return tokenSuccessPsTimeout!!
            }
        }
        return if (simpleYesOrNo) {
            // call simple yes or no confirmation
            simpleYesNo()!!
        } else {
            // call confirm yes or no with limited number of retries and
            // conformations from robot
            confirmYesNo()!!
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        speechSensor!!.removeSensorListener(helper)
        return curToken
    }

    private fun simpleYesNo(): ExitToken? {
        if (helper!!.hasNewUnderstanding()) {
            if (helper!!.allUnderstoodIntents.contains(intentYes)) {
                return tokenSuccessPsYes
            } else if (helper!!.allUnderstoodIntents.contains(intentNo)) {
                return tokenSuccessPsNo
            }
        }
        return ExitToken.loop(50)
    }

    private fun confirmYesNo(): ExitToken? {
        if (sayingComplete != null) {
            sayingComplete = if (!sayingComplete!!.isDone) {
                return ExitToken.loop(50)
            } else {
                helper!!.startListening()
                null
            }
        }

        // Ask Again
        if (Time.currentTimeMillis() > nextRepeat) {
            if (timesAsked++ < maxRepeats) {
                try {
                    val lang : Language = langSlot?.recall<LanguageType>()?.value ?: Language.EN
                    sayingComplete = speechActuator!!.sayTranslated(confirmText,lang)
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
                val lang : Language = langSlot?.recall<LanguageType>()?.value ?: Language.EN
                sayingComplete = speechActuator!!.sayTranslated("Please answer with yes or no!",lang)
            } catch (ex: IOException) {
                logger.error("IO Exception in speechActuator")
            }
        }
        return ExitToken.loop(50)
    }

    companion object {
        private const val KEY_USE_LANGUAGE = "#_USE_LANGUAGE"
        private const val KEY_TEXT = "#_MESSAGE"
        private const val KEY_SIMPLE = "#_USESIMPLE"
        private const val KEY_TIMEOUT = "#_TIMEOUT"
        private const val KEY_REPEAT = "#_REPEAT_AFTER"
        private const val KEY_MAXREP = "#_REPEATS"
        private const val KEY_INTENT_NO = "#_INTENT_NO"
        private const val KEY_INTENT_YES = "#_INTENT_YES"
        private const val KEY_SPEECH_SENSOR = "#_SPEECH_SENSOR"
        private const val ACTUATOR_SPEECHACTUATOR = "SpeechActuator"
        private const val PS_TIMEOUT = "timeout"
        private const val PS_NO = "confirmNo"
        private const val PS_YES = "confirmYes"
    }
}
