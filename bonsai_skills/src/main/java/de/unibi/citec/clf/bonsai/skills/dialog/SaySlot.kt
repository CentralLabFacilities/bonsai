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
 * This class is used to say something with some or all content read in from the
 * memory.
 *
 * <pre>
 *
 * Options:
 *  #_MESSAGE:      [String] Optional (default: "$S")
 *                      -> Text said by the robot. $S will be replaced by memory slot content
 *  #_BLOCKING:     [boolean] Optional (default: true)
 *                      -> If true skill ends after talk was completed
 * #_USE_LANGUAGE:  [boolean] Optional (default: true)
 *                      -> Read Language slot to determine speak language
 * #_LANG:          [Language] text language (default: EN)
 *                      -> Use the given language to speak the (same language) #_MESSAGE.
 *                         This Defaults #_USE_LANGUAGE to false, set it to enable translation to current language
 *
 * Slots:
 *  StringSlot: [String] [Read]
 *      -> String to incorporate into talk
 *
 * ExitTokens:
 *  success:    Talk completed successfully
 *
 * Sensors:
 *
 * Actuators:
 *  SpeechActuator: [SpeechActuator]
 *      -> Used to say #_MESSAGE
 *
 * </pre>
 *
 * @author rfeldhans
 * @author jkummert
 */
class SaySlot : AbstractSkill() {
    private var blocking = true
    private var sayText = REPLACE_STRING
    private var tokenSuccess: ExitToken? = null
    private var stringSlot: MemorySlotReader<String>? = null
    private var langSlot: MemorySlotReader<LanguageType>? = null
    private var speechActuator: SpeechActuator? = null
    private var sayingComplete: Future<String?>? = null
    private var speakerlang: Language = Language.EN
    private var textLang: Language = Language.EN

    override fun configure(configurator: ISkillConfigurator) {
        sayText = configurator.requestOptionalValue(SAY_TEXT, sayText)
        if (sayText.contains(REPLACE_STRING)) {
            stringSlot = configurator.getReadSlot("StringSlot", String::class.java)
        }
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking)
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator::class.java)
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
        speakerlang = langSlot?.recall<LanguageType>()?.value ?: Language.EN

        var sayStr = stringSlot?.recall<String>()

        if (sayStr == null) {
            logger.info("String from slot was not set, will use '' ")
            sayStr = ""
        }

        sayStr = sayText.replace(REPLACE_STRING, sayStr)
        sayStr = sayStr.replace("_", " ")
        logger.debug("saying(in ${speakerlang}): $sayStr [$textLang]")
        sayingComplete = speechActuator?.sayTranslated(sayStr, speakerlang, textLang)

        return true
    }

    override fun execute(): ExitToken {
        return if (!sayingComplete!!.isDone && blocking) {
            ExitToken.loop(50)
        } else tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }

    companion object {
        private const val SAY_TEXT = "#_MESSAGE"
        private const val KEY_BLOCKING = "#_BLOCKING"
        private const val KEY_USE_LANGUAGE = "#_USE_LANGUAGE"
        private const val KEY_TEXT_LANGUAGE = "#_LANG"
        private const val REPLACE_STRING = "\$S"
    }
}
