package de.unibi.citec.clf.bonsai.actuators

import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import de.unibi.citec.clf.btl.data.speech.llm.Message
import de.unibi.citec.clf.btl.data.speech.llm.Tool
import java.io.IOException
import java.util.concurrent.Future

interface LLM : Actuator {
    @Throws(IOException::class)
    fun queryVision(prompt: String): Future<String?>

    /**
     * Query an LLM.
     *
     * Uses a default system message
     *
     * @param prompt the query
     * @return Generated response
     */
    @Throws(IOException::class)
    fun query(prompt: String): Future<String?>

    /**
     * Query an LLM
     *
     * With a custom system message
     *
     * @param system the system message
     * @param prompt the query
     * @return Generated response
     */
    @Throws(IOException::class)
    fun query(system: String, prompt: String): Future<String?>

    /**
     * Query an LLM
     *
     * With a Message History
     *
     * @param messages List of messages
     * @param tools List of Tool definitions
     * @return Generated response
     */
    @Throws(IOException::class)
    fun query(messages: List<Message>, tools: List<Tool> = listOf()): Future<Message?>

    /**
     * Helper, get last text output
     */
    @Throws(IOException::class)
    fun getLastFuture(): Future<String?>?

}