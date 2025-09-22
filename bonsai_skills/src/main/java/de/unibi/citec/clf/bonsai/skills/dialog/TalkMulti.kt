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
 * Use this state to let the robot talk multilingual.
 * Reads the Language slot to determine what text to speak
 *
 * <pre>
 *
 * Options:
 * #_MSG_<LANG>:      [String]
 *      -> Text said by the robot for the <LANG>
 * #_BLOCKING:     [boolean] Optional (default: true)
 *      -> If true skill ends after talk was completed
 * #_DEFAULT:      [String] Optional (default: EN)
 *      -> default msg if #_MSG_<LANG> is not defined
 * Slots:
 *
 * ExitTokens:
 * success:    Talk completed successfully
 *
 * Sensors:
 *
 * Actuators:
 * SpeechActuator: [SpeechActuator]
 * -> Used to say #_MSG
 *
</pre> *
 *
 * @author lruegeme
 */
class TalkMulti : AbstractSkill() {
    companion object {
        private const val KEY_MESSAGE_PREFIX = "#_MSG_"
        private const val KEY_BLOCKING = "#_BLOCKING"
        private const val KEY_DEFAULT = "#_DEFAULT"
    }

    private var default = Language.EN
    private var tokenSuccess: ExitToken? = null
    private var blocking = true
    private var text = HashMap<Language, String>()
    private var speechActuator: SpeechActuator? = null
    private var sayingComplete: Future<String?>? = null
    private var langSlot: MemorySlotReader<LanguageType>? = null
    override fun configure(configurator: ISkillConfigurator) {
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking)
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator::class.java)
        langSlot = configurator.getReadSlot("Language", LanguageType::class.java)
        default = Language.valueOf(configurator.requestOptionalValue(KEY_DEFAULT,"EN"))

        for (key in configurator.configurationKeys) {
            if (key.startsWith(KEY_MESSAGE_PREFIX)) {
                val value = configurator.requestValue(key).trim().replace(" +".toRegex(), " ")
                val lang = key.removePrefix(KEY_MESSAGE_PREFIX)
                val language = Language.valueOf(lang)
                logger.debug("found $key as ${language.name}: $value")
                text[language] = value
            }
        }

        if (!text.containsKey(default)) {
            logger.warn("Default msg to use is $default, but no #_MSG_${default.name} is defined")
        }

    }

    override fun init(): Boolean {

        var textLanguage = Language.EN
        val lang : Language = langSlot?.recall<LanguageType>()?.value ?: Language.EN
        val msg = if(!text.containsKey(lang)) {
            logger.warn("missing message for ${lang.name} default to ${default.name}")
            textLanguage = default
            text[default]
        } else {
            textLanguage = lang
            text[lang]
        }

        logger.debug("saying(${lang}): $msg")
        sayingComplete = speechActuator!!.sayTranslated(msg!!, speakLanguage = lang, textLanguage = textLanguage)

        return true
    }

    override fun execute(): ExitToken {
        return if (!sayingComplete!!.isDone && blocking) {
            ExitToken.loop(50)
        } else {
            logger.info("said: ${sayingComplete?.get()}")
            tokenSuccess!!
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        if(curToken.exitStatus == ExitStatus.FATAL()) {
            sayingComplete?.cancel(true)
        }
        return curToken
    }


}
