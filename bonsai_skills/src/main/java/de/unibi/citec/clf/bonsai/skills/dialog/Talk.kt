package de.unibi.citec.clf.bonsai.skills.dialog

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speech.Language
import de.unibi.citec.clf.btl.data.speech.LanguageType
import java.util.concurrent.Future

/**
 * Use this state to let the robot talk.
 *
 * <pre>
 *
 * Options:
 * #_MESSAGE:      [String] Required
 *      -> Text said by the robot
 * #_BLOCKING:     [boolean] Optional (default: true)
 *      -> If true skill ends after talk was completed
 * #_USE_LANGUAGE: [boolean] Optional (default: true)
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
 */
class Talk : AbstractSkill() {
    private var tokenSuccess: ExitToken? = null
    private var blocking = true
    private var text = ""
    private var speechActuator: SpeechActuator? = null
    private var sayingComplete: Future<String?>? = null
    private var langSlot: MemorySlotReader<LanguageType>? = null
    private var speakerlang: Language = Language.EN
    private var textLang: Language = Language.EN
    override fun configure(configurator: ISkillConfigurator) {
        text = configurator.requestValue(KEY_MESSAGE)
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking)
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator::class.java)
        text = text.trim().replace(" +".toRegex(), " ")

        if(configurator.hasConfigurationKey(KEY_TEXT_LANGUAGE)) {
            val input = configurator.requestValue(KEY_TEXT_LANGUAGE)
            textLang = Language.valueOf(input)
            speakerlang = textLang
            if(!configurator.hasConfigurationKey(KEY_USE_LANGUAGE)) {
                logger.warn("$KEY_TEXT_LANGUAGE is defined, $KEY_USE_LANGUAGE defaults to false")
            }
            if(configurator.requestOptionalBool(KEY_USE_LANGUAGE, false)) {
                langSlot = configurator.getReadSlot("Language", LanguageType::class.java)
            }
        } else if (configurator.requestOptionalBool(KEY_USE_LANGUAGE, true)) {
            langSlot = configurator.getReadSlot("Language", LanguageType::class.java)
        }

    }

    override fun init(): Boolean {
        speakerlang  = langSlot?.recall<LanguageType>()?.value ?: speakerlang
        logger.debug("saying(in ${speakerlang}): $text [$textLang]")
        sayingComplete = speechActuator!!.sayTranslated(text,speakerlang, textLang)
        return true
    }

    override fun execute(): ExitToken {
        return if (!sayingComplete!!.isDone && blocking) {
            ExitToken.loop(50)
        } else tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        if(curToken.exitStatus.isFatal) {
            logger.error("cancel speak")
            sayingComplete?.cancel(true)
        }
        return curToken
    }

    companion object {
        private const val KEY_MESSAGE = "#_MESSAGE"
        private const val KEY_BLOCKING = "#_BLOCKING"
        private const val KEY_USE_LANGUAGE = "#_USE_LANGUAGE"
        private const val KEY_TEXT_LANGUAGE = "#_LANG"
    }
}
