package de.unibi.citec.clf.bonsai.engine;


import net.sf.saxon.TransformerFactoryImpl;
import nu.xom.*;
import org.apache.commons.scxml2.io.SCXMLReader;
import org.apache.commons.scxml2.model.ModelException;
import org.apache.commons.scxml2.model.SCXML;
import org.apache.log4j.Logger;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;

import javax.xml.parsers.ParserConfigurationException;
import javax.xml.parsers.SAXParserFactory;
import javax.xml.stream.XMLStreamException;
import javax.xml.transform.ErrorListener;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerConfigurationException;
import javax.xml.transform.TransformerException;
import javax.xml.transform.stream.StreamResult;
import javax.xml.transform.stream.StreamSource;
import java.io.*;
import java.net.URL;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Use this class to parse a SCXML file.
 *
 * @author lruegeme
 */
public class SCXMLDecoder {

    private static final Logger logger = Logger.getLogger(SCXMLDecoder.class);
    private static final URL PATH_TO_XSL = SCXMLDecoder.class.getClassLoader().getResource("resolveSCXMLSources.xsl");

    private SCXMLDecoder() {
    }

    /**
     * Parses SCXML file.
     * <p>
     * this will resolve SCXML sources
     *
     * @param scxml
     * @param includeMapping
     * @return
     */
    public static SCXML parseSCXML(File scxml, Map<String, String> includeMapping) throws TransformerException {
        String transformed = transformSCXML(scxml, includeMapping);
        InputSource is = new InputSource(new StringReader(transformed));
        is.setEncoding("UTF-16");

        try {
            if (SCXMLValidator.hasDuplicates(is)) {
                logger.error("scxml has duplicates");
                throw new TransformerException("state machine has duplicates");
            }
        } catch (ParsingException | IOException | SAXException | ParserConfigurationException ex) {
            logger.error("TODO validator failed");
        }
        logger.debug(transformed);

        is = new InputSource(new StringReader(transformed));
        return parseSCXML(is);

    }

    /**
     * Parses some scxml to the actual SCXML type
     *
     * input has to be valid scxml
     *
     * @param in the scxml in xml form
     * @return the scxml as SCXML
     * @throws TransformerException something went wrong
     */
    public static SCXML parseSCXML(InputSource in) throws TransformerException { try {
            SCXML parsed = SCXMLReader.read(in.getCharacterStream());
            return parsed;
        } catch (IOException | ModelException ex) {
            logger.error(ex.getMessage());
            throw new TransformerException(ex);
    } catch (XMLStreamException e) {
        throw new RuntimeException(e);
    }
    }

    /**
     * Resolves all includes and src attributes.
     *
     * @param scxml
     * @param includeMapping
     * @return the transformed file as String
     */
    public static String transformSCXML(File scxml, Map<String, String> includeMapping) throws TransformerException {
        TransformerFactoryImpl factory = new TransformerFactoryImpl();
        MapEntryResolver uriResolver = new MapEntryResolver();
        uriResolver.setMap(includeMapping);

        factory.setURIResolver(uriResolver);
        Transformer transformer = null;
        try {
            transformer = factory.newTransformer(new StreamSource(PATH_TO_XSL.openStream()));
        } catch (IOException | TransformerConfigurationException ex) {
            throw new TransformerException(ex);
        }


        ByteArrayOutputStream out = new ByteArrayOutputStream();

        logger.debug("transforming file: " + scxml);

        StreamSource streamIn = new StreamSource(scxml);
        StreamResult streamOut = new StreamResult(out);

        final List<TransformerException> exceptions = new ArrayList<>();

        transformer.setErrorListener(new ErrorListener() {
            @Override
            public void warning(TransformerException e) throws TransformerException {
                exceptions.add(e);
            }

            @Override
            public void error(TransformerException e) throws TransformerException {
                exceptions.add(e);
            }

            @Override
            public void fatalError(TransformerException e) throws TransformerException {
                exceptions.add(e);
            }
        });

        transformer.transform(streamIn, streamOut);

        if (!exceptions.isEmpty()) {
            logger.fatal("Transformation Exceptions:");
            exceptions.forEach(ex -> logger.error(" - " + ex));
            logger.debug("Path Mapping:");
            includeMapping.forEach((key, value) -> logger.debug(" - " + key + "=" + value));
            throw exceptions.get(0);
        }

        try {
            out = mergeDataModels(new ByteArrayInputStream(out.toByteArray()));
            String xml = out.toString();
            logger.trace("transformed: \n" + xml);
            WriteXmlTmp(xml);
            return xml;
        } catch (IOException | SAXException | ParsingException | ParserConfigurationException ex) {
            logger.error(ex);
            throw new TransformerException(ex);
        }

    }

    private static void WriteXmlTmp(String xml) throws FileNotFoundException {
        PrintWriter pw;
        try {
            pw = new PrintWriter("/tmp/lastscxml.xml");
        } catch (Exception e) {
            String filename = "/tmp/lastscml_" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd-HH-mm-ss")) + ".xml";
            pw = new PrintWriter(filename);
        }
        pw.println(xml);
        pw.close();
    }

    private static ByteArrayOutputStream mergeDataModels(
            ByteArrayInputStream bais) throws IOException, SAXException, ParsingException, ParserConfigurationException {

        XMLReader reader = SAXParserFactory.newInstance().newSAXParser().getXMLReader();
        Builder b = new Builder(reader);
        Document doc = b.build(bais);

        XPathContext context = new XPathContext("ns", doc.getRootElement()
                .getNamespaceURI());

        Element datamodel;
        Nodes nodes = doc.query("/ns:scxml/ns:datamodel", context);
        if (nodes.size() == 0) {
            datamodel = new Element("datamodel");
            doc.getRootElement().appendChild(datamodel);
        } else {
            datamodel = (Element) nodes.get(0);
        }

        // move data items
        Nodes dataNodes = doc.query(
                "//ns:state[@initial]/ns:datamodel/ns:data", context);
        for (int i = 0; i < dataNodes.size(); i++) {
            Node data = dataNodes.get(i);
            data.detach();
            datamodel.appendChild(data);
        }

        // remove duplicate data items for state prefix
        Nodes prefixNodes = datamodel.query("ns:data[@id='#_STATE_PREFIX']",
                context);
        for (int i = 1; i < prefixNodes.size(); i++) {
            prefixNodes.get(i).detach();
        }

        // remove now empty datamodels
        Nodes sourcedDataModels = doc.query(
                "//ns:state[@initial]/ns:datamodel", context);
        for (int i = 0; i < sourcedDataModels.size(); i++) {
            sourcedDataModels.get(i).detach();
        }

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Serializer s = new Serializer(out, "UTF-8");
        s.setIndent(4);
        s.setMaxLength(80);
        s.write(doc);
        return out;
    }

}
