package de.unibi.citec.clf.bonsai.skills.dialog.nlu

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speechrec.NLU

/**
 * Check if NLU has one of the given intents
 *
 * <pre>
 *
 * Options:
 *  #_INTENTS:              [String[]] Required
 *                              -> List of allowed intents separated by ';'
 *
 * Slots:
 *  NLUSlot:                [NLU] (Read)
 *
 * ExitTokens:
 *  success.{intent}:       NLU has the specified intent
 *  error.other:            intent is not listed
 *
 * </pre>
 *
 * @author lruegeme
 */
class CheckIntent : AbstractSkill() {
    companion object {
        private const val KEY_DEFAULT = "#_INTENTS"
    }

    private var possibleIntents: List<String> = listOf()
    private var intent = ""

    private var tokenError: ExitToken? = null
    private val tokenMap = HashMap<String, ExitToken>()

    private var nluSlot: MemorySlotReader<NLU>? = null

    override fun configure(configurator: ISkillConfigurator) {
        possibleIntents = configurator.requestValue(KEY_DEFAULT).split(";")
        for (nt in possibleIntents) {
            if (nt.isBlank()) continue
            tokenMap[nt] = configurator.requestExitToken(ExitStatus.SUCCESS().ps(nt))
        }
        tokenError = configurator.requestExitToken(ExitStatus.ERROR().ps("other"))
        nluSlot = configurator.getReadSlot<NLU>("NLUSlot", NLU::class.java)
    }

    override fun init(): Boolean {
        intent = nluSlot?.recall<NLU>()?.intent ?: return false
        logger.info("nlu.intent is '$intent'")
        return true
    }

    override fun execute(): ExitToken {
        if (possibleIntents.contains(intent)) {
            return tokenMap[intent]!!
        }
        return tokenError!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }


}
