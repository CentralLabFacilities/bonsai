package de.unibi.citec.clf.bonsai.model.scxml

import nl.adaptivity.xmlutil.ExperimentalXmlUtilApi
import nl.adaptivity.xmlutil.serialization.XML
import nl.adaptivity.xmlutil.serialization.XmlConfig.Companion.IGNORING_UNKNOWN_CHILD_HANDLER
import java.io.File

class DataTest {

    val PATH_TO_EX01: String = DataTest::class.java.getResource("/01_one_skill.xml").getPath()
    val PATH_TO_EX02: String = DataTest::class.java.getResource("/02_multiple_skills.xml").getPath()
    val PATH_TO_EX03: String = DataTest::class.java.getResource("/03_exit_status.xml").getPath()
    val PATH_TO_EX04: String = DataTest::class.java.getResource("/04_missing_transition.xml").getPath()
    val PATH_TO_EX05: String = DataTest::class.java.getResource("/05_memory_slots.xml").getPath()
    val PATH_TO_EX06: String = DataTest::class.java.getResource("/06_parameter.xml").getPath()
    val PATH_TO_EX07: String = DataTest::class.java.getResource("/07_scxml_variables_conditions.xml").getPath()
    val PATH_TO_EX08: String = DataTest::class.java.getResource("/08_scxml_onentry.xml").getPath()
    val PATH_TO_EX09: String = DataTest::class.java.getResource("/09_compound.xml").getPath()
    val PATH_TO_EX10: String = DataTest::class.java.getResource("/10_lists.xml").getPath()

    @OptIn(ExperimentalXmlUtilApi::class)
    val format = XML() {
        defaultPolicy {
            pedantic = false
            autoPolymorphic = true
            unknownChildHandler = IGNORING_UNKNOWN_CHILD_HANDLER
            isUnchecked = true
        }
    }


    @org.junit.jupiter.api.Test
    fun testExampleParsing() {

        val examples = listOf(
            PATH_TO_EX01,
            PATH_TO_EX02,
            PATH_TO_EX03,
            PATH_TO_EX04,
            PATH_TO_EX05,
            PATH_TO_EX06,
            PATH_TO_EX07,
            PATH_TO_EX08,
            PATH_TO_EX09
        )

        examples.forEach {
            val xml = File(it).readText()
            val scxml = format.decodeFromString(SCXML.serializer(), xml)
            assert(scxml.states.isNotEmpty())
        }
    }

    @org.junit.jupiter.api.Test
    fun testExample01() {
        val a = State(id = "Nothing", transition = listOf(Transition("Nothing.fatal", "")))
        val scxml = SCXML(
            initial = a.id,
            states = listOf(a),
            data = listOf(Data("#_STATE_PREFIX", "'de.unibi.citec.clf.bonsai.skills.example.'")),
            slots = null
        )

        val xml = File(PATH_TO_EX01).readText()
        val parsed = format.decodeFromString(SCXML.serializer(), xml)
        assert(parsed == scxml)

    }

    @org.junit.jupiter.api.Test
    fun testExample02() {
        val xml = File(PATH_TO_EX02).readText()
        val parsed = format.decodeFromString(SCXML.serializer(), xml)
        assert(parsed.states.size == 2)
        assert(parsed.states.any { it.id == "example.Nothing#2" })
        assert(parsed.states.any { state -> state.transition?.any { it.target == "example.Nothing#2" } == true })
        assert(parsed.states.none { it.id == "Wait" })
    }

    @org.junit.jupiter.api.Test
    fun testExample07() {
        val xml = File(PATH_TO_EX07).readText()
        val parsed = format.decodeFromString(SCXML.serializer(), xml)
        assert(parsed.states.size == 2)
        assert(parsed.states.any { state -> state.transition?.any { it.cond == "hellosToSpeak > 1" } == true })
        assert(parsed.states.any { state -> state.transition?.any { it.actions?.isNotEmpty() == true } == true })
        assert(parsed.states.any { state ->
            state.transition?.any { action ->
                action.actions?.any {
                    it is Action.Assign
                } == true
            } == true
        })
        assert(parsed.states.none { state ->
            state.transition?.any { action ->
                action.actions?.any {
                    it is Action.Send
                } == true
            } == true
        })
    }


}
