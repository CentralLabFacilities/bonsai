package de.unibi.citec.clf.bonsai.test

import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.SCXMLEvent
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.StateEntered
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.TransitionOccurred
import java.util.function.Consumer
import org.apache.log4j.Logger
import java.util.concurrent.TimeoutException

class TestListener private constructor() : Consumer<SCXMLEvent> {
    private enum class State {
        running,
        success,
        failure
    }

    private val enteredStates: Map<String, Int> = HashMap()
    private var requiredSkills: MutableMap<String, Int> = HashMap()
    @Volatile private var state = State.running
    private var successState: String? = null
    private var failureState: String? = null
    private var successTransition: String? = null
    @JvmOverloads
    @Throws(TimeoutException::class)
    fun waitForStatus(timeout: Long = 9000): Boolean {
        val endtimeout = timeout + Time.currentTimeMillis()
        while (state == State.running) {
            Thread.yield()
            if (Time.currentTimeMillis() > endtimeout) {
                throw TimeoutException("Statemachine took too long")
            }
        }
        return state == State.success
    }

    private fun setEndState(state: String) {
        successState = state
    }

    private fun onEntry(stateId: String) {
        if (this.state != State.running) return

        val cleanStateId = stateId.split('#').firstOrNull() ?: stateId

        if (requiredSkills.containsKey(cleanStateId)) {
            requiredSkills[cleanStateId] = requiredSkills[cleanStateId]!! - 1
        }

        if (stateId.split(".").last() == successState)
            if (requiredSkills.isEmpty() || requiredSkills.filter { it.value != 0 }.isEmpty()) {
                this.state = State.success
            } else {
                this.state = State.failure
                logger.fatal("missing states")
                requiredSkills.forEach { (key: String, value: Int) ->
                    logger.fatal(
                        "$key: $value"
                    )
                }
            }

        if (stateId == failureState) this.state = State.failure
    }

    override fun accept(change: SCXMLEvent) {
        when (change) {
            is StateEntered -> change.state()?.let(::onEntry)
            is TransitionOccurred -> {
                if (state == State.running && successTransition != null &&
                    change.event() == successTransition) {
                    state = State.success
                }
            }
            else -> Unit
        }
    }

    companion object {
        private val logger = Logger.getLogger(TestListener::class.java)

        @JvmStatic
        fun newSuccessState(state: String?, fail: String?): TestListener {
            val testListener = TestListener()
            testListener.successState = state
            testListener.failureState = fail
            return testListener
        }

        @JvmStatic
        fun newSuccessEvent(trans: String?, fail: String?): TestListener {
            val testListener = TestListener()
            testListener.successTransition = trans
            testListener.failureState = fail
            return testListener
        }

        @JvmStatic
        fun newEndFatalSkillCounter(requires: MutableMap<String, Int>): TestListener {
            val testListener = TestListener()
            testListener.successState = "End"
            testListener.failureState = "Fatal"
            testListener.requiredSkills = requires
            return testListener
        }

        @JvmStatic
        fun newEndFatal(): TestListener {
            val testListener = TestListener()
            testListener.successState = "End"
            testListener.failureState = "Fatal"
            return testListener
        }
    }
}
