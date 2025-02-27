package de.unibi.citec.clf.bonsai.skills.dialog

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.skills.dialog.nlu.TalkNLURegex
import de.unibi.citec.clf.btl.data.speechrec.Language
import de.unibi.citec.clf.btl.data.speechrec.LanguageType
import java.io.IOException
import java.util.concurrent.Future

/**
 * Use this state to let the robot talk.
 *
 * <pre>
 *
 * Options:
 * #_MESSAGE:      [String] Required
 * -> Text said by the robot
 * #_BLOCKING:     [boolean] Optional (default: true)
 * -> If true skill ends after talk was completed
 * #_USE_LANGUAGE: [boolean] Optional (default: false)
 * -> Read Language slot to determine speak language else it defaults to "EN"
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
    private var lang: Language = Language.EN
    override fun configure(configurator: ISkillConfigurator) {
        text = configurator.requestValue(KEY_MESSAGE)
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking)
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator::class.java)
        text = text.trim().replace(" +".toRegex(), " ")

        if (configurator.requestOptionalBool(KEY_USE_LANGUAGE, true)) {
            langSlot = configurator.getReadSlot("Language", LanguageType::class.java)
        }
    }

    override fun init(): Boolean {

        lang  = langSlot?.recall<LanguageType>()?.value ?: Language.EN
        logger.debug("saying(${lang}): $text")
        sayingComplete = speechActuator!!.sayTranslated(text,lang)

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
    }
}
