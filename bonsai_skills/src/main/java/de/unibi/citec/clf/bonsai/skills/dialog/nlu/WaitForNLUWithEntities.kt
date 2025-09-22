package de.unibi.citec.clf.bonsai.skills.dialog.nlu

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.core.`object`.Sensor
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.util.helper.SimpleNLUHelper
import de.unibi.citec.clf.btl.data.speech.LanguageType
import de.unibi.citec.clf.btl.data.speech.NLU

/**
 * Wait for the robot to understand something containing certain intents.
 *
 * <pre>
 *
 * Options:
 *  #_INTENT:            [String] Required
 *                          -> the intents to listen for
 *  #_ENTITIES           [String] Required
 *                          -> List of required entities separated by ';'
 *  #_TIMEOUT:           [Long] Optional (default: -1)
 *                          -> Amount of time waited to understand something
 *
 * Slots:
 *  NLUSlot: [NLU] (Write)
 *      -> Save the understood NLU
 *
 * ExitTokens:
 *  success:                    intent was understood
 *  error.missing               intent was understood but a required entity was missing
 *  error.timeout:              Timeout reached (only used when timeout is set to positive value)
 *
 * </pre>
 *
 * @author lruegeme
 */
class WaitForNLUWithEntities : AbstractSkill(){
    private var intent: String? = null
    private var required_entities: List<String>? = null
    private val speechSensorName = "NLUSensor"
    private var timeout: Long = -1

    private var helper: SimpleNLUHelper? = null

    private var tokenErrorPsTimeout: ExitToken? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenMissing: ExitToken? = null

    private var speechSensor: Sensor<NLU>? = null
    private var nluSlot: MemorySlotWriter<NLU>? = null
    private var langSlot: MemorySlotWriter<LanguageType>? = null

    override fun configure(configurator: ISkillConfigurator) {
        intent = configurator.requestValue(KEY_DEFAULT)
        required_entities = configurator.requestValue(KEY_ENTITY).split(";")
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()

        speechSensor = configurator.getSensor<NLU>(speechSensorName, NLU::class.java)
        nluSlot = configurator.getWriteSlot<NLU>("NLUSlot", NLU::class.java)

        tokenMissing = configurator.requestExitToken(ExitStatus.ERROR().ps("missing"))
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        if (timeout > 0) {
            tokenErrorPsTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"))
        }

        if (configurator.requestOptionalBool(KEY_SET_LANGUAGE, false)) {
            langSlot = configurator.getWriteSlot("Language", LanguageType::class.java)
        }
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
        if (!helper!!.hasNewUnderstanding()) {
            if (timeout > 0) {
                if (Time.currentTimeMillis() > timeout) {
                    logger.info("timeout reached")
                    return tokenErrorPsTimeout!!
                }
            }

            return ExitToken.loop(50)
        }

        val understood = helper!!.allNLUs

        for (nt in understood) {
            if (intent == nt.intent) {
                logger.info("understood '$nt'")
                if (nt.hasAllEntities(required_entities!!)) {
                    nluSlot?.memorize<NLU>(nt)
                    langSlot?.memorize(LanguageType(nt.lang))
                    return tokenSuccess!!
                } else {
                    logger.error("missing one of the required entities " + required_entities.toString())
                    return tokenMissing!!
                }
            }
        }

        return ExitToken.loop(50)
    }

    override fun end(curToken: ExitToken): ExitToken {
        speechSensor?.removeSensorListener(helper)
        return curToken
    }

    companion object {
        private const val KEY_SET_LANGUAGE = "#_SET_LANGUAGE"
        private const val KEY_DEFAULT = "INTENT"
        private const val KEY_ENTITY = "ENTITIES"
        private const val KEY_TIMEOUT = "TIMEOUT"
    }
}
