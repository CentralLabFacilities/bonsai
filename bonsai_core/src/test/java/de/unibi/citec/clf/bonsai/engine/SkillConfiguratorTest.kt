package de.unibi.citec.clf.bonsai.engine

import de.unibi.citec.clf.bonsai.core.exception.MissingKeyConfigurationException
import de.unibi.citec.clf.bonsai.skills.ParameterSkill
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.*

class SkillConfiguratorTest {


    @Test
    fun configureRequiredParamsTest() {

        val config = SkillConfigurator.getDefaultConf()
        config.activateObjectAnyway = true
        var conf = SkillConfigurator.createConfigPhase(config, HashMap())
        var skill = ParameterSkill()
        skill.configure(conf)

        assertEquals(conf.requiredParams.size.toLong(), 4)

        for (s in conf.requiredParams.keys) {
            assert(requiredParams.containsKey(s))
        }


        conf.activateObjectPhase(requiredParams, HashMap())
        skill.configure(conf)

        assertTrue(conf.exceptions.isEmpty())
        assertEquals(skill.valDouble, 1.5, 0.0)
        assertEquals(skill.valInt, 1)
        assertEquals(skill.valString, "foo")
        assertEquals(skill.valBool, true)

        val missedParam = HashMap(requiredParams)
        missedParam.remove(ParameterSkill.KEY_BOOL)
        conf = SkillConfigurator.createConfigPhase(config, missedParam)
        skill = ParameterSkill()
        skill.configure(conf)
        conf.activateObjectPhase(missedParam, HashMap())

        assertEquals(conf.exceptions.size.toLong(), 1)
        val e = conf.exceptions[0]
        assert(e is MissingKeyConfigurationException)
        assertEquals((e as MissingKeyConfigurationException).key, ParameterSkill.KEY_BOOL)

    }

    @Test
    fun configureRequiredParamsMissingTest() {

        val config = SkillConfigurator.getDefaultConf()
        config.activateObjectAnyway = true

        val missedParam = HashMap(requiredParams)
        missedParam.remove(ParameterSkill.KEY_BOOL)
        val conf = SkillConfigurator.createConfigPhase(config, missedParam)
        val skill = ParameterSkill()
        skill.configure(conf)
        conf.activateObjectPhase(missedParam, HashMap())

        assertEquals(conf.exceptions.size.toLong(), 1)
        val e = conf.exceptions[0]
        assert(e is MissingKeyConfigurationException)
        assertEquals((e as MissingKeyConfigurationException).key, ParameterSkill.KEY_BOOL)

    }

    @Test
    fun configureOptionalParamsMissingTest() {
        val config = SkillConfigurator.getDefaultConf()
        config.activateObjectAnyway = true

        val conf = SkillConfigurator.createConfigPhase(config, requiredParams)
        val skill = ParameterSkill()
        skill.configure(conf)
        conf.activateObjectPhase(requiredParams, HashMap())
        skill.configure(conf)

        assertEquals(conf.optionalParams.size.toLong(), 4)

        for (s in conf.optionalParams.keys) {
            assert(optionalParams.containsKey(s))
        }

        assertEquals(skill.optBool, true)
        assertEquals(skill.optDouble, 1.5, 0.0)
        assertEquals(skill.optInt, 1);
        assertEquals(skill.optString, "foo");


    }

    @Test
    fun configureOptionalParamsTest() {
        val config = SkillConfigurator.getDefaultConf()
        config.activateObjectAnyway = true

        val conf = SkillConfigurator.createConfigPhase(config, requiredParams)
        val skill = ParameterSkill()
        skill.configure(conf)
        conf.activateObjectPhase(requiredParams + optionalParams, HashMap())
        skill.configure(conf)

        assertEquals(conf.optionalParams.size.toLong(), 4)

        for (s in conf.optionalParams.keys) {
            assert(optionalParams.containsKey(s))
        }

        assertEquals(skill.optBool, false)
        assertEquals(skill.optDouble, 2.5, 0.0)
        assertEquals(skill.optInt, 2);
        assertEquals(skill.optString, "bar");


    }

    companion object {

        private val requiredParams: Map<String, String> = mapOf(
            ParameterSkill.KEY_BOOL to "true",
            ParameterSkill.KEY_DOUBLE to "1.5",
            ParameterSkill.KEY_INTEGER to "1",
            ParameterSkill.KEY_VALUE to "foo"
        )


        private val optionalParams: Map<String, String> = mapOf(
            ParameterSkill.KEY_OPT_BOOL to "false",
            ParameterSkill.KEY_OPT_DOUBLE to "2.5",
            ParameterSkill.KEY_OPT_INTEGER to "2",
            ParameterSkill.KEY_OPT_VALUE to "bar"
        )
    }


}