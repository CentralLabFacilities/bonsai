package de.unibi.citec.clf.bonsai.core.configuration;

import nu.xom.Document;
import nu.xom.ParsingException;
import org.junit.Test;
import org.xml.sax.SAXException;

import javax.xml.transform.TransformerException;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

import static org.junit.Assert.*;

public class XmlConfigurationParserTest {

    @Test
    public void testTransformXML() {
        final String path = getClass().getResource("/TestTransform.xml").getPath();
        final String target = getClass().getResource("/Merged.xml").getPath();

        try {
            Document doc = XmlConfigurationParser.transformXML(new File(path));
            System.out.println("Parsed Config:\n" + doc.toXML());
            String merged = String.join("\n", Files.readAllLines(Paths.get(target)));
            assertEquals(doc.toXML().replaceAll("\r", ""),merged);
        } catch (IOException | TransformerException | SAXException | ParsingException e) {
            fail();
        }






    }
}