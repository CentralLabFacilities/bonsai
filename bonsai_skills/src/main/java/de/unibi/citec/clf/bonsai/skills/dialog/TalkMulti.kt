package de.unibi.citec.clf.bonsai.skills.dialog

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speechrec.Language
import de.unibi.citec.clf.btl.data.speechrec.LanguageType
import java.util.concurrent.Future

/**
 * Use this state to let the robot talk multilingual.
 * Reads the Language slot to determine what text to speak
 *
 * <pre>
 *
 * Options:
 * #_MSG_<LANG>:      [String]
 * -> Text said by the robot for the <LANG>
 * #_BLOCKING:     [boolean] Optional (default: true)
 * -> If true skill ends after talk was completed
 *
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
    private var tokenSuccess: ExitToken? = null
    private var blocking = true
    private var text = HashMap<Language, String>()
    private var speechActuator: SpeechActuator? = null
    private var sayingComplete: Future<Void>? = null
    private var langSlot: MemorySlotReader<LanguageType>? = null
    override fun configure(configurator: ISkillConfigurator) {
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking)
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator::class.java)
        langSlot = configurator.getReadSlot("Language", LanguageType::class.java)

        for (key in configurator.configurationKeys) {
            if (key.startsWith(KEY_MESSAGE_PREFIX)) {
                val value = configurator.requestValue(key).trim().replace(" +".toRegex(), " ")
                val lang = key.removePrefix(KEY_MESSAGE_PREFIX)
                val language = Language.valueOf(lang)
                logger.debug("found $key as ${language.name}: $value")
                text[language] = value
            }
        }

    }

    override fun init(): Boolean {

        val lang : Language = langSlot?.recall<LanguageType>()?.value ?: Language.EN
        if(!text.containsKey(lang)) {
            logger.error("unhandled language")
            return false
        }
        val msg = text[lang]
        logger.debug("saying(${lang}): $msg")
        sayingComplete = speechActuator!!.sayAsync(msg!!, lang)

        return true
    }

    override fun execute(): ExitToken {
        return if (!sayingComplete!!.isDone && blocking) {
            ExitToken.loop(50)
        } else tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        if(curToken.exitStatus == ExitStatus.FATAL()) {
            sayingComplete?.cancel(true)
        }
        return curToken
    }

    companion object {
        private const val KEY_MESSAGE_PREFIX = "#_MSG"
        private const val KEY_BLOCKING = "#_BLOCKING"
    }
}
