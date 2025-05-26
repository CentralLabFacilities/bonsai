package de.unibi.citec.clf.bonsai.engine.scxml

import de.unibi.citec.clf.bonsai.test.TestListener.Companion.newEndFatal
import de.unibi.citec.clf.bonsai.test.TestListener.Companion.newEndFatalSkillCounter
import junit.framework.TestCase
import org.apache.log4j.PropertyConfigurator
import org.junit.Assert
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeoutException
import javax.xml.transform.TransformerException

class StatemachineTest {
    private val PATH_TO_LOGGING_PROPERTIES = javaClass.getResource("/testLogging.properties").path
    @Before
    fun initialize() {
        PropertyConfigurator.configure(PATH_TO_LOGGING_PROPERTIES)
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun reusedVariables() {
        var sm = "variablesReused.xml"
        var conf = "TestConfig.xml"
        var test = newEndFatalSkillCounter(mutableMapOf(
                "dialog.Talk" to 4)
        )

        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun moreVariables() {
        var sm = "variables.xml"
        var conf = "TestConfig.xml"
        var test = newEndFatalSkillCounter(mutableMapOf(
                "dialog.Talk" to 2)
        )
        // Check if test fails
        TestCase.assertFalse(TestTools.testStatemachine(conf, sm, test))

        test = newEndFatalSkillCounter(mutableMapOf(
                "dialog.Talk" to 3)
        )
        // Check if spoken 3 times
        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))
        sm = "variables2.xml"
        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))

        // Check End
        sm = "variables3.xml"
        test = newEndFatal()
        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))

    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun testVarsInDatamodel() {
        val sm = "variablesInDatamodel.xml"
        val conf = "TestConfig.xml"
        val test = newEndFatal()
        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun testVarsInDatamodelFailure() {
        val sm = "variablesInDatamodelFailure.xml"
        val conf = "TestConfig.xml"
        val test = newEndFatal()
        TestCase.assertFalse(TestTools.testStatemachine(conf, sm, test))
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun missingSendEventTransition() {
        val sm = "missingSendEventTransition.xml"
        val conf = "TestConfig.xml"
        val res = TestTools.loadStatemachine(sm)
        TestCase.assertFalse(res.success())
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun hangupTest() {
        val sm = "parallelHangupExample.xml"
        val conf = "TestConfig.xml"
        val test = newEndFatal()
        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun includeSendEventTransition() {
        val sm = "includeSend.xml"
        val conf = "TestConfig.xml"
        val res = TestTools.loadStatemachine(sm)
        TestCase.assertTrue(res.success())
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun sendEventTransition() {
        val sm = "sendEventTransition.xml"
        val conf = "TestConfig.xml"
        val res = TestTools.loadStatemachine(sm)
        TestCase.assertTrue(res.success())
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun slotMapping() {
        val sm = "slotMapping.xml"
        val conf = "TestConfig.xml"
        val test = newEndFatal()
        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun slotMappingRegex() {
        val sm = "slotMappingRegex.xml"
        val conf = "TestConfig.xml"
        val test = newEndFatal()
        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun slotMappingRegexNoValidate() {
        val sm = "slotMappingRegexNoValidate.xml"
        val conf = "TestConfig.xml"
        val test = newEndFatal()
        //failing for now
//        assertTrue(TestTools.testStatemachine(conf, sm, test));
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun slotMappingnoValidate() {
        val sm = "slotMappingNoValidate.xml"
        val conf = "TestConfig.xml"
        val test = newEndFatal()
        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun testMissingTransition() {
        val sm = "missingTransition.xml"
        val res = TestTools.loadStatemachine(sm)
        TestCase.assertFalse(res.success())
        Assert.assertEquals(0, res.configurationResults.configurationExceptions.size.toLong())
        Assert.assertEquals(0, res.configurationResults.otherExceptions.size.toLong())
        Assert.assertEquals(1, res.validationResult.transitionNotFoundException.size.toLong())
        Assert.assertEquals(0, res.stateMachineResults.numErrors().toLong())
        Assert.assertEquals(0, res.stateMachineResults.numWarnings().toLong())
        Assert.assertEquals(0, res.loadingExceptions.size.toLong())
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun testMissingParameter() {
        val sm = "missingParameter.xml"
        val res = TestTools.loadStatemachine(sm)
        TestCase.assertFalse(res.success())
        Assert.assertEquals(0, res.configurationResults.configurationExceptions.size.toLong())
        Assert.assertEquals(0, res.configurationResults.otherExceptions.size.toLong())
        Assert.assertEquals(0, res.validationResult.transitionNotFoundException.size.toLong())
        Assert.assertEquals(1, res.stateMachineResults.numErrors().toLong())
        // general "Error configuring skill" is a warning :C
        Assert.assertEquals(1, res.stateMachineResults.numWarnings().toLong())
        Assert.assertEquals(0, res.loadingExceptions.size.toLong())
    }

    @Test
    @Throws(TransformerException::class, TimeoutException::class)
    fun testOptionalParameter() {
        val sm = "optionalParameter.xml"
        val conf = "TestConfig.xml"
        val res = TestTools.loadStatemachine(sm)
        TestCase.assertTrue(res.success())
        val test = newEndFatal()
        TestCase.assertTrue(TestTools.testStatemachine(conf, sm, test))
    } //    @Test
    //    public void testParallelWorking() throws TransformerException, TimeoutException {
    //        final String sm = "parallelWorking.xml";
    //        final String conf = "TestConfig.xml";
    //
    //        LoadingResults res = TestTools.loadStatemachine(sm);
    //        assertTrue(res.success());
    //
    //        TestListener test = TestListener.newEndFatal();
    //        assertTrue(TestTools.testStatemachine(conf, sm, test));
    //    }
    //
    //    @Test
    //    public void testParallelBugged() throws TransformerException, TimeoutException {
    //        final String sm = "parallelBugged.xml";
    //        final String conf = "TestConfig.xml";
    //
    //        LoadingResults res = TestTools.loadStatemachine(sm);
    //        assertTrue(res.success());
    //
    //        TestListener test = TestListener.newEndFatal();
    //        assertTrue(TestTools.testStatemachine(conf, sm, test));
    //    }
}
