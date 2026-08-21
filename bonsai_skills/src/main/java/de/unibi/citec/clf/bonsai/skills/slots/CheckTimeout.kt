package de.unibi.citec.clf.bonsai.skills.slots

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator

/**
 * Compares the time against a timeout
 *
 * <pre>
 *
 * Options:
 *  #_TIMEOUT:          [int] Optional (Default: 1000)
 *                          -> Timeout duration in milliseconds.
 *                          -> The stored timestamp is considered timed out
 *                             when the current time is greater than the
 *                             stored timestamp plus this timeout.
 *
 * ExitTokens:
 *  success.timeout:
 *      The configured timeout has elapsed.
 *
 *  success.good:
 *      The configured timeout has not elapsed yet.
 *
 */
class CheckTimeout : AbstractSkill() {
    private var timeout: Long = 1000


    private var tokenTimeout: ExitToken? = null
    private var tokenNoTimeout: ExitToken? = null
    var longSlot: MemorySlotReader<Long>? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"))
        tokenNoTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("good"))
        longSlot = configurator.getReadSlot("Time", Long::class.java)
        timeout = configurator.requestOptionalInt(DEFAULT_KEY, timeout.toInt()).toLong()
    }

    override fun init(): Boolean {
        logger.info("using timeout of " + timeout + "ms")
        return true
    }

    override fun execute(): ExitToken? {
        val stored = longSlot?.recall<Long?>() ?: run {
            logger.error("Could not read from slot or null")
            return ExitToken.fatal()
        }
        val current = Time.currentTimeMillis()
        logger.trace("current time is: $current")
        logger.trace("Stored time is $stored")
        return if (current > stored + timeout) {
            tokenTimeout
        } else {
            tokenNoTimeout
        }
    }

    override fun end(curToken: ExitToken?): ExitToken? {
        return curToken
    }

    companion object {
        private const val DEFAULT_KEY = "#_TIMEOUT"
    }
}
