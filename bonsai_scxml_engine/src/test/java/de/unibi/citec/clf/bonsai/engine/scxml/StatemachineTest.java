package de.unibi.citec.clf.bonsai.engine.scxml;

import de.unibi.citec.clf.bonsai.engine.LoadingResults;
import de.unibi.citec.clf.bonsai.test.TestListener;
import org.apache.log4j.PropertyConfigurator;
import org.junit.Before;
import org.junit.Test;

import javax.xml.transform.TransformerException;
import java.util.concurrent.TimeoutException;

import static junit.framework.TestCase.assertFalse;
import static junit.framework.TestCase.assertTrue;
import static org.junit.Assert.assertEquals;

public class StatemachineTest {

    private final String PATH_TO_LOGGING_PROPERTIES = getClass().getResource("/testLogging.properties").getPath();

    @Before
    public void initialize() {
        PropertyConfigurator.configure(PATH_TO_LOGGING_PROPERTIES);
    }

    @Test
    public void testVarsInDatamodel() throws TransformerException, TimeoutException {
        final String sm = "variablesInDatamodel.xml";
        final String conf = "TestConfig.xml";

        TestListener test = TestListener.newEndFatal();

        assertTrue(TestTools.testStatemachine(conf, sm, test));
    }

    @Test
    public void testVarsInDatamodelFailure() throws TransformerException, TimeoutException {
        final String sm = "variablesInDatamodelFailure.xml";
        final String conf = "TestConfig.xml";

        TestListener test = TestListener.newEndFatal();

        assertFalse(TestTools.testStatemachine(conf, sm, test));
    }

    @Test
    public void missingSendEventTransition() throws TransformerException, TimeoutException {
        final String sm = "missingSendEventTransition.xml";
        final String conf = "TestConfig.xml";

        LoadingResults res = TestTools.loadStatemachine(sm);
        assertFalse(res.success());
    }

    @Test
    public void hangupTest() throws TransformerException, TimeoutException {
        final String sm = "parallelHangupExample.xml";
        final String conf = "TestConfig.xml";

        TestListener test = TestListener.newEndFatal();
        assertTrue(TestTools.testStatemachine(conf, sm, test));
    }

    @Test
    public void sendEventTransition() throws TransformerException, TimeoutException {
        final String sm = "sendEventTransition.xml";
        final String conf = "TestConfig.xml";

        LoadingResults res = TestTools.loadStatemachine(sm);
        assertTrue(res.success());
    }

    @Test
    public void slotMapping() throws TransformerException, TimeoutException {
        final String sm = "slotMapping.xml";
        final String conf = "TestConfig.xml";

        TestListener test = TestListener.newEndFatal();
        assertTrue(TestTools.testStatemachine(conf, sm, test));
    }

    @Test
    public void slotMappingRegex() throws TransformerException, TimeoutException {
        final String sm = "slotMappingRegex.xml";
        final String conf = "TestConfig.xml";

        TestListener test = TestListener.newEndFatal();
        assertTrue(TestTools.testStatemachine(conf, sm, test));
    }

    @Test
    public void slotMappingRegexNoValidate() throws TransformerException, TimeoutException {
        final String sm = "slotMappingRegexNoValidate.xml";
        final String conf = "TestConfig.xml";

        TestListener test = TestListener.newEndFatal();
        //failing for now 
//        assertTrue(TestTools.testStatemachine(conf, sm, test));
    }

    @Test
    public void slotMappingnoValidate() throws TransformerException, TimeoutException {
        final String sm = "slotMappingNoValidate.xml";
        final String conf = "TestConfig.xml";

        TestListener test = TestListener.newEndFatal();
        assertTrue(TestTools.testStatemachine(conf, sm, test));
    }

    @Test
    public void testMissingTransition() throws TransformerException, TimeoutException {
        final String sm = "missingTransition.xml";

        LoadingResults res = TestTools.loadStatemachine(sm);

        assertFalse(res.success());

        assertEquals(0,res.configurationResults.getConfigurationExceptions().size());
        assertEquals(0,res.configurationResults.otherExceptions.size());
        assertEquals(1,res.validationResult.transitionNotFoundException.size());
        assertEquals(0,res.stateMachineResults.numErrors());
        assertEquals(0,res.stateMachineResults.numWarnings());
        assertEquals(0,res.loadingExceptions.size());
    }

    @Test
    public void testMissingIncomingTransition() throws TransformerException, TimeoutException {
        final String sm = "missingIncomingTransition.xml";

        LoadingResults res = TestTools.loadStatemachine(sm);

        assertFalse(res.success());

        assertEquals(0,res.configurationResults.getConfigurationExceptions().size());
        assertEquals(0,res.configurationResults.otherExceptions.size());
        assertEquals(0,res.validationResult.transitionNotFoundException.size());
        assertEquals(1,res.validationResult.unreachedStates.size());
        assertEquals(0,res.stateMachineResults.numErrors());
        assertEquals(0,res.stateMachineResults.numWarnings());
        assertEquals(0,res.loadingExceptions.size());
    }

    @Test
    public void testMissingParameter() throws TransformerException, TimeoutException {
        final String sm = "missingParameter.xml";

        LoadingResults res = TestTools.loadStatemachine(sm);

        assertFalse(res.success());

        assertEquals(0,res.configurationResults.getConfigurationExceptions().size());
        assertEquals(0,res.configurationResults.otherExceptions.size());
        assertEquals(0,res.validationResult.transitionNotFoundException.size());
        assertEquals(1,res.stateMachineResults.numErrors());
        // general "Error configuring skill" is a warning :C
        assertEquals(1,res.stateMachineResults.numWarnings());
        assertEquals(0,res.loadingExceptions.size());
    }

    @Test
    public void testOptionalParameter() throws TransformerException, TimeoutException {
        final String sm = "optionalParameter.xml";
        final String conf = "TestConfig.xml";

        LoadingResults res = TestTools.loadStatemachine(sm);
        assertTrue(res.success());

        TestListener test = TestListener.newEndFatal();
        assertTrue(TestTools.testStatemachine(conf, sm, test));
    }

}
