package de.unibi.citec.clf.bonsai.skills.slots

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator

/**
 * Stores the current Time
 *
 * @author lruegeme
 */
class StoreTime : AbstractSkill() {
    private var tokenSuccess: ExitToken? = null
    var longSlot: MemorySlotWriter<Long>? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        longSlot = configurator.getWriteSlot("Time", Long::class.java)
    }

    override fun init(): Boolean {
        val time = Time.currentTimeMillis()
        longSlot?.memorize(time)
        return true
    }

    override fun execute(): ExitToken {
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
