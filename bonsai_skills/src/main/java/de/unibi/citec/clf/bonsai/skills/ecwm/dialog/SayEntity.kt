package de.unibi.citec.clf.bonsai.skills.ecwm.dialog

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speech.Language
import de.unibi.citec.clf.btl.data.speech.LanguageType
import de.unibi.citec.clf.btl.data.world.Entity
import java.util.concurrent.Future

/**
 * This skill is used to say something incorporating the entity name or first given_name attribute
 *
 * <pre>
 *
 * Options:
 *  #_MESSAGE:      [String] Optional (default: "$S")
 *                      -> Text said by the robot. $S will be replaced by entity/type
 *  #_BLOCKING:     [boolean] Optional (default: true)
 *                      -> If true skill ends after talk was completed
 *  #_USE_NAME:     [boolean] Optional (default: true)
 *                      -> If true use the GIVEN_NAME attribute of the entity
 *  #_USE_TYPE:     [boolean] Optional (default: true)
 *                      -> use the modelName of the entity (prefer GIVEN_NAME)
 *
 * Slots:
 *  Entity: [de.unibi.citec.clf.btl.data.world.Entity] [Read]
 *      -> Entity to incorporate into talk
 *
 * ExitTokens:
 *  success:    Talk completed successfully
 *
 * Sensors:
 *
 * Actuators:
 *  SpeechActuator: [de.unibi.citec.clf.bonsai.actuators.SpeechActuator]
 *      -> Used to say #_MESSAGE
 *  ECWMRobocup: [de.unibi.citec.clf.bonsai.actuators.ECWMRobocup]
 *      -> Used to get the GIVEN_NAME
 *
 * </pre>
 * @author lruegeme
 */
class SayEntity : AbstractSkill() {

    companion object {
        private const val KEY_USE_TYPE = "#_USE_TYPE"
        private const val KEY_USE_NAME = "#_USE_NAME"
        private const val KEY_BLOCKING = "#_BLOCKING"
        private const val SAY_TEXT = "#_MESSAGE"
        private const val KEY_USE_LANGUAGE = "#_USE_LANGUAGE"

        private const val REPLACE_STRING = "\$S"
        private const val GIVEN_NAME = "given_name"
    }

    // defaults
    private var useGivenName = true
    private var useType = true
    private var blocking = true
    private var sayText = REPLACE_STRING

    private var tokenSuccess: ExitToken? = null
    private var slot: MemorySlotReader<Entity>? = null
    private var speechActuator: SpeechActuator? = null
    private var sayingComplete: Future<String?>? = null
    private var ecwm: ECWMRobocup? = null
    private var langSlot: MemorySlotReader<LanguageType>? = null
    override fun configure(configurator: ISkillConfigurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        slot = configurator.getReadSlot("Entity", Entity::class.java)

        sayText = configurator.requestOptionalValue(SAY_TEXT, sayText)
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking)
        useType = configurator.requestOptionalBool(KEY_USE_TYPE, useType)
        useGivenName = configurator.requestOptionalBool(KEY_USE_NAME, useGivenName)

        if(useGivenName) {
            ecwm = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)
        }

        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator::class.java)

        if (configurator.requestOptionalBool(KEY_USE_LANGUAGE, true)) {
            langSlot = configurator.getReadSlot("Language", LanguageType::class.java)
        }

    }

    override fun init(): Boolean {
        var sayStr: String? = null
        val lang : Language = langSlot?.recall<LanguageType>()?.value ?: Language.EN

        // if(Matcher.quoteReplacement(REPLACE_STRING).toRegex().containsMatchIn(sayText)) {
        if (sayText.contains(REPLACE_STRING)) {
            var entity = slot?.recall<Entity>() ?: run {
                logger.error("entity is null")
                return false
            }

            sayStr = if(useType) entity.modelName.replace("/", " ") else entity.id

            if (useGivenName) {
                logger.info("getting attributes of ${entity.modelName}")
                val attrib = ecwm?.getEntityAttributes(entity)?.get()
                sayStr = attrib?.getFirstAttributeOrNull(GIVEN_NAME) ?: sayStr
            }

            sayStr = sayText.replace(REPLACE_STRING, sayStr ?: "")
            sayStr = sayStr.replace("_", " ")
        } else {
            // sayStr = sayText.replace("_".toRegex(), " ")
            sayStr = sayText.replace("_", " ")
        }
        logger.info("saying: $sayStr")

        sayingComplete = speechActuator!!.sayTranslated(sayStr,lang)
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


}