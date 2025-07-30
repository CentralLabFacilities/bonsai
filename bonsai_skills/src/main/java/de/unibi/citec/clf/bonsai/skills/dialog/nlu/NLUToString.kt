package de.unibi.citec.clf.bonsai.skills.dialog.nlu

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.List
import de.unibi.citec.clf.btl.data.speechrec.NLU
import de.unibi.citec.clf.btl.data.speechrec.NLUEntity

/**
 *  Load an NLU text into a slot
 *
 * @author lruegeme
 */
class NLUToString : AbstractSkill() {

    private var tokenSuccess: ExitToken? = null
    private var nluSlot: MemorySlotReader<NLU>? = null
    private var textSlot: MemorySlotWriter<String>? = null


    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        nluSlot = configurator.getReadSlot("NLUSlot", NLU::class.java)
        textSlot = configurator.getWriteSlot("Text", String::class.java)
    }

    override fun init(): Boolean {
        val nlu = nluSlot?.recall<NLU>() ?: run {
            logger.error("slot is empty")
            return false
        }
        val text = nlu.text
        textSlot?.memorize(text)
        return true
    }

    override fun execute(): ExitToken {
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }


}
