package de.unibi.citec.clf.bonsai.skills.dialog.llm

import de.unibi.citec.clf.bonsai.actuators.LLM
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import java.util.concurrent.Future

/**
 * Send a query to an LLM and optionally wait for the response.
 *
 *
 * <pre>
 *
 * Options:
 * #_TIMEOUT             [Integer] Optional (default: 5000)
 *      -> Maximum time in milliseconds to wait for the LLM response
 *         in blocking mode.
 * #_BLOCKING            [boolean] Optional (default: true)
 *      -> Whether to wait for the LLM response.
 * #_PROMPT              [String] Required
 *      -> The query to send to the LLM.
 *
 * Slots:
 * reply: [String] (Write, Optional)
 *      -> Memory slot where the LLM response is stored.
 *      -> Used only when #_BLOCKING is true.
 *
 * ExitTokens:
 * success:              LLM query successfully completed
 * error.timeout:        LLM did not respond within the configured timeout
 *
 * Sensors:
 *
 * Actuators:
 *  LLM
 *
 * </pre>
 *
 * @author
 */


class LLMQuery : AbstractSkill() {

    companion object {
        private const val KEY_TIMEOUT = "#_TIMEOUT"
        private const val KEY_BLOCKING = "#_BLOCKING"
        private const val KEY_PROMPT = "#_PROMPT"
    }

    private var timeout = 5000L
    private var blocking = true
    private var promt = ""

    private var fut: Future<String?>? = null
    private var llm : LLM? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenTimeout: ExitToken? = null
    private var slot: MemorySlotWriter<String>? = null

    override fun configure(configurator: ISkillConfigurator) {
        llm = configurator.getActuator("LLM", LLM::class.java)
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()
        blocking = configurator.requestOptionalBool(KEY_BLOCKING,blocking)
        promt = configurator.requestValue(KEY_PROMPT)
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        if (blocking) {
            tokenTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"))
            slot = configurator.getWriteSlot("reply", String::class.java)
        }

    }

    override fun init(): Boolean {
        logger.info("Sending Request '$promt'")
        fut = llm?.query(promt)

        if (blocking) {
            logger.debug("blocking, waiting for " + timeout + "ms")
            timeout += Time.currentTimeMillis()
        }
        return true
    }

    override fun execute(): ExitToken {
        if(!blocking) {
            /**  nonblocking, use [de.unibi.citec.clf.bonsai.skills.hack.GetLastLLMReply] to get the answer */
            return tokenSuccess!!
        }

        if(fut?.isDone == false) {
            return if (timeout < Time.currentTimeMillis()) tokenTimeout!!
            else ExitToken.loop(50)
        }

        val reply = fut?.get()
        logger.debug("got reply: $reply" )
        slot?.memorize(reply)
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}