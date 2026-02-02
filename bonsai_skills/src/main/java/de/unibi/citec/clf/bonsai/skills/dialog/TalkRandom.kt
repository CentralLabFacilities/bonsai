package de.unibi.citec.clf.bonsai.skills.dialog

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speech.Language
import de.unibi.citec.clf.btl.data.speech.LanguageType
import net.sf.saxon.functions.Lang
import java.io.IOException
import java.util.*
import java.util.concurrent.Future


/**
 * This a version of the Talk skill.
 * Use this state to let the robot talk a random phrase of a semicolon-separated choice of messages.
 * 
 * <pre>
 * 
 * Options:
 * #_MESSAGE:      [String] Required
 *      -> Texts said by the robot, separated by ;
 * #_BLOCKING:     [Boolean] Optional (default: true)
 *      -> If true skill ends after talk was completed
 * #_USE_LANGUAGE: [Boolean] Optional (default: true)
 *      -> Read Language slot to determine speak language
 * #_LANG:  [Language] text language (default: EN)
 *      -> Use the given language to speak the (same language) #_MESSAGE.
 *         !! Setting this changes the default of #_USE_LANGUAGE to false, letting the robot always speak in #_LANG !!
 *         set #_USE_LANGUAGE to enable translation of #_MESSAGE from #_LANG to current slot language
 * Slots:
 * 
 * ExitTokens:
 * success:    Talk completed successfully
 * 
 * Sensors:
 * 
 * Actuators:
 * SpeechActuator: [SpeechActuator]
 * -> Used to say #_MESSAGE
 * 
</pre> * 
 * 
 * @author lziegler, lruegeme
 * @author rfeldhans
 * @author jkummert
 * @author prenner
 * @author nschmitz
 */
class TalkRandom : AbstractSkill() {
    private var tokenSuccess: ExitToken? = null
    private var blocking = true
    private var text = ""
    private var randomText = ""
    private var speechActuator: SpeechActuator? = null
    private var sayingComplete: Future<String?>? = null
    private var langSlot: MemorySlotReader<LanguageType>? = null
    private var speakerLang = Language.EN
    private var textLang = Language.EN

    override fun configure(configurator: ISkillConfigurator) {
        text = configurator.requestValue(KEY_MESSAGE)
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking)
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        speechActuator = configurator.getActuator(SPEECH_ACTUATOR_NAME, SpeechActuator::class.java)
        text = text.trim().replace(" +".toRegex(), " ")

        if (configurator.hasConfigurationKey(KEY_TEXT_LANGUAGE)) {
            val input = configurator.requestValue(KEY_TEXT_LANGUAGE)
            textLang = Language.valueOf(input)
            speakerLang = textLang
            if (!configurator.hasConfigurationKey(KEY_USE_LANGUAGE)) {
                logger.warn("$KEY_TEXT_LANGUAGE is defined, but $KEY_USE_LANGUAGE defaults to false")
            }
            if (configurator.requestOptionalBool(KEY_USE_LANGUAGE, false)) {
                langSlot = configurator.getReadSlot(LANG_SLOT_NAME, LanguageType::class.java)
            }
        } else if (configurator.requestOptionalBool(KEY_USE_LANGUAGE, true)) {
            langSlot = configurator.getReadSlot(LANG_SLOT_NAME, LanguageType::class.java)
        }
    }

    override fun init(): Boolean {
        speakerLang = langSlot?.recall<LanguageType>()?.value ?: speakerLang
        val texts: Array<String?> = text.split(";".toRegex()).dropLastWhile { it.isEmpty() }.toTypedArray()
        randomText = texts[Random().nextInt(texts.size)] ?: randomText
        logger.debug("Saying (in ${speakerLang}): $randomText [$textLang]")
        sayingComplete = speechActuator!!.sayTranslated(randomText, speakerLang, textLang)
        return true
    }


    override fun execute(): ExitToken? {
        return if (!sayingComplete!!.isDone && blocking) {
            ExitToken.loop(50)
        } else tokenSuccess
    }

    override fun end(curToken: ExitToken): ExitToken {
        if (curToken.exitStatus.isFatal) {
            logger.error("Cancel speak")
            sayingComplete!!.cancel(true)
        }
        return curToken
    }

    companion object {
        private const val KEY_MESSAGE = "#_MESSAGE"
        private const val KEY_BLOCKING = "#_BLOCKING"
        private const val KEY_USE_LANGUAGE = "#_USE_LANGUAGE"
        private const val KEY_TEXT_LANGUAGE = "#_LANG"
        private const val LANG_SLOT_NAME = "Language"
        private const val SPEECH_ACTUATOR_NAME = "SpeechActuator"
    }
}
