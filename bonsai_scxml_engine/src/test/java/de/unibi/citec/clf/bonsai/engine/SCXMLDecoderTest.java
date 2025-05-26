/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.unibi.citec.clf.bonsai.engine;

import org.apache.commons.scxml2.model.SCXML;
import org.apache.log4j.Logger;
import org.apache.log4j.PropertyConfigurator;
import org.junit.Before;
import org.junit.Test;

import javax.xml.transform.TransformerException;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.HashMap;

import static org.junit.Assert.*;

/**
 * @author lruegeme
 */
public class SCXMLDecoderTest {

    private final String PATH_TO_LOGGING_PROPERTIES = getClass().getResource("/testLogging.properties").getPath();
    private final String PATH_TO_CORE = getClass().getResource("/state_machines").getPath();
    private Logger logger = Logger.getLogger(getClass());

    @Before
    public void initialize() {
        PropertyConfigurator.configure(PATH_TO_LOGGING_PROPERTIES);
    }

    @Test
    public void emptyDatamodel() throws TransformerException {

        final String path = PATH_TO_CORE + "/noDatamodelInclude.xml";

        final HashMap<String, String> hashMap = new HashMap<>();
        hashMap.put("TEST", PATH_TO_CORE);

        final SCXML scxml = SCXMLDecoder.parseSCXML(new File(path), hashMap);

        assert (scxml.getDatamodel() == null);

        //TODO check if file is merged
    }

    @Test
    public void undefinedInclude() throws TransformerException {

        final String path = PATH_TO_CORE + "/include2.xml";

        final HashMap<String, String> hashMap = new HashMap<>();
        hashMap.put("TESTNOPE", PATH_TO_CORE);

        try {
            SCXMLDecoder.transformSCXML(new File(path), hashMap);
            fail("transform should have failed");
        } catch (Exception e) {

        }

        //TODO check if file is merged
    }

    @Test
    public void missingFile() {

        final String path = PATH_TO_CORE + "/include2.xml";

        final HashMap<String, String> hashMap = new HashMap<>();
        hashMap.put("TEST", "/tmp/empty");

        try {
            SCXMLDecoder.transformSCXML(new File(path), hashMap);
            fail();
        } catch (Exception e) {
        }

    }

    @Test
    public void fileMerge() throws TransformerException, IOException {

        final String path = PATH_TO_CORE + "/include2.xml";

        final HashMap<String, String> hashMap = new HashMap<>();
        hashMap.put("TEST", PATH_TO_CORE);

        String variableTransform = SCXMLDecoder.transformSCXML(new File(path), hashMap);
        String merged = String.join("\n", Files.readAllLines(Paths.get(PATH_TO_CORE + "/merged.xml")));

        assertEquals(variableTransform.replaceAll("\r", ""),merged);

//        SCXML scxmlIn = SCXMLDecoder.parseSCXML(new InputSource(new StringReader(variableTransform)));
//        SCXML scxmlTarget = SCXMLDecoder.parseSCXML(new InputSource(new StringReader(merged)));
//        assertEquals(scxmlIn., scxmlTarget.toString());

    }

    @Test
    public void simpleInclude() {
        PropertyConfigurator.configure(PATH_TO_LOGGING_PROPERTIES);

        final String path = PATH_TO_CORE + "/include.xml";

        final HashMap<String, String> hashMap = new HashMap<>();
        hashMap.put("TEST", PATH_TO_CORE);

        SCXML variableTransform;

        try {
            variableTransform = SCXMLDecoder.parseSCXML(new File(path), hashMap);
            assertEquals("consume", variableTransform.getInitial());
        } catch (TransformerException ex) {
            fail("could not parse scxml");
        }


    }

}
