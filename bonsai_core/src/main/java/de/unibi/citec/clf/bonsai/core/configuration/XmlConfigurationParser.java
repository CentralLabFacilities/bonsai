package de.unibi.citec.clf.bonsai.core.configuration;

import de.unibi.citec.clf.bonsai.core.configuration.data.*;
import de.unibi.citec.clf.bonsai.core.exception.ParseException;
import net.sf.saxon.TransformerFactoryImpl;
import nu.xom.*;
import org.apache.log4j.Logger;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.XMLReaderFactory;

import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerConfigurationException;
import javax.xml.transform.TransformerException;
import javax.xml.transform.stream.StreamResult;
import javax.xml.transform.stream.StreamSource;
import java.io.*;
import java.net.URI;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;

/**
 * Parser for XML configuration files. A schema is installed with BonSAI specifying the expected format.
 *
 * <p>
 * The expected format defines, that all sensors must be defined before any actuator is specified.
 * </p>
 *
 * @author jwienke
 */
public class XmlConfigurationParser implements ConfigurationParser {

    private Logger logger = Logger.getLogger(getClass());
    private static final String ROOT_ELEMENT_NAME = "BonsaiConfiguration";
    private static final String FACTORY_OPTIONS_ELEMENT_NAME = "FactoryOptions";
    private static final String MEMORY_ELEMENT_NAME = "WorkingMemory";
    private static final String TRANSFORMER_ELEMENT_NAME = "CoordinateTransformer";
    private static final String SLOT_ELEMENT_NAME = "Slot";
    private static final String SLOTS_ELEMENT_NAME = "Slots";
    private static final String SLOT_CLASS_ARG = "slotClass";
    private static final String OPTION_ELEMENT_NAME = "Option";
    private static final String SENSOR_ELEMENT_NAME = "Sensor";
    private static final String OPTIONS_ELEMENT_NAME = "Options";
    private static final String FACTORY_CLASS_ARG = "factoryClass";
    private static final String MEMORY_CLASS_ARG = "workingMemoryClass";
    private static final String TRANSFORMER_CLASS_ARG = "coordinateTransformerClass";
    private static final String KEY = "key";
    private static final String OPTION_KEY_ARG = KEY;
    private static final String SENSOR_KEY_ARG = KEY;
    private static final String MEMORY_KEY_ARG = KEY;
    private static final String DATA_TYPE_CLASS_ARG = "dataTypeClass";
    private static final String LIST_TYPE_CLASS_ARG = "listTypeClass";
    private static final String SENSOR_CLASS_ARG = "sensorClass";
    private static final String WIRE_TYPE_CLASS_ARG = "wireTypeClass";
    private static final String ACTUATOR_ELEMENT_NAME = "Actuator";
    private static final String ACTUATOR_KEY_ARG = KEY;
    private static final String ACTUATOR_CLASS_ARG = "actuatorClass";
    private static final String ACTUATOR_INTERFACE_ARG = "actuatorInterface";
    private boolean parsingCompleted = false;

    private static final URL PATH_TO_XSL = XmlConfigurationParser.class.getClassLoader()
            .getResource("resolveConfigSources.xsl");
    private static final URL PATH_TO_XSD = XmlConfigurationParser.class.getClassLoader()
            .getResource("BonsaiConfiguration.xsd");

    private BonsaiConfigurationData config;

    /**
     * Constructor.
     */
    public XmlConfigurationParser() {
    }

    public static Document transformXML(File configurationFile) throws TransformerConfigurationException, IOException, TransformerException, SAXException, ParsingException {
        TransformerFactoryImpl factory = new TransformerFactoryImpl();
        Transformer transformer = factory.newTransformer(new StreamSource(
                PATH_TO_XSL.openStream()));

        // Transform the source XML to System.out.
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        StreamResult streamResult = new StreamResult(out);
        transformer.transform(new StreamSource(configurationFile), streamResult);

        XMLReader xerces = XMLReaderFactory.createXMLReader("org.apache.xerces.parsers.SAXParser");
        xerces.setFeature("http://apache.org/xml/features/validation/schema", true);
        xerces.setFeature("http://xml.org/sax/features/validation", true);
        xerces.setProperty("http://apache.org/xml/properties/schema/external-noNamespaceSchemaLocation",
                PATH_TO_XSD.toExternalForm());

        Builder builder = new Builder(xerces, true);

        Document doc = builder.build(new ByteArrayInputStream(out.toByteArray()));
        return doc;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public void parse(URI configurationUri) throws IOException, ParseException, IllegalStateException {

        File configurationFile;
        try {
            configurationFile = new File(configurationUri.getPath());
            if (!configurationFile.exists() || !configurationFile.canRead()) {
                throw new IOException("Given configuration file does not exist: " + configurationFile);
            }
        } catch (IllegalArgumentException e) {
            throw new IOException("IOException while reading config file: " + configurationUri + ": " + e.getMessage(),
                    e);
        }

        if (parsingCompleted) {
            logger.warn("Parser already parsed a file");
        }

        config = new BonsaiConfigurationData();
        config.actuators = new HashMap<>();
        config.factories = new HashMap<>();
        config.memories = new HashMap<>();
        config.sensors = new HashMap<>();

        try {
            Document doc = transformXML(configurationFile);

            logger.debug("Parsed Config:\n" + doc.toXML());

            parseFactorySettings(doc);
            parseSensors(doc);
            parseActuators(doc);
            parseWorkingMemories(doc);
            parseCoordinateTransformer(doc);

            parsingCompleted = true;

        } catch (ParsingException e) {
            throw new ParseException(e);
        } catch (SAXException e) {
            throw new ParseException("Maybe xerces SAXParser missing?", e);
        } catch (TransformerException ex) {
            java.util.logging.Logger.getLogger(XmlConfigurationParser.class.getName()).log(Level.SEVERE, null, ex);
        }
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public void parse(InputStream configuration) throws IOException, ParseException, IllegalStateException {

        if (parsingCompleted) {
            logger.warn("Parser already parsed a file");
        }

        try {

            XMLReader xerces = XMLReaderFactory.createXMLReader("org.apache.xerces.parsers.SAXParser");
            xerces.setFeature("http://apache.org/xml/features/validation/schema", true);
            xerces.setFeature("http://xml.org/sax/features/validation", true);
            xerces.setProperty("http://apache.org/xml/properties/schema/external-noNamespaceSchemaLocation",
                    PATH_TO_XSD.toExternalForm());

            Builder builder = new Builder(xerces, true);

            Document doc = builder.build(configuration);

            logger.debug("Parsed Config:\n" + doc.toXML());

            parseFactorySettings(doc);
            parseSensors(doc);
            parseActuators(doc);
            parseWorkingMemories(doc);
            parseCoordinateTransformer(doc);

            parsingCompleted = true;

        } catch (ParsingException e) {
            throw new ParseException(e);
        } catch (SAXException e) {
            throw new ParseException("Maybe xerces SAXParser missing?", e);
        }
    }

    // /**
    //  * {@inheritDoc}
    //  */
    // @Override
    // public void parse(URI configurationUri) throws IOException, ParseException, IllegalStateException {
    //     parse(configurationUri.toURL().openStream());
    // }

    /**
     * Parse the given string. The XML content will not be validated at all!
     */
    @Override
    public void parse(String configuration) throws IOException, ParseException, IllegalStateException {
        URL url = new URL(configuration);
        parse(url.openStream());
    }

    private void parseFactorySettings(Document doc) throws ParseException {

        logger.debug("Parsing factory settings");

        Nodes factoryOptions = doc.query("/" + ROOT_ELEMENT_NAME + "/" + FACTORY_OPTIONS_ELEMENT_NAME);
        for (int i = 0; i < factoryOptions.size(); i++) {

            Node factoryOptionNode = factoryOptions.get(i);
            logger.debug("Possible " + FACTORY_OPTIONS_ELEMENT_NAME + ": " + factoryOptionNode.toXML());
            if (!(factoryOptionNode instanceof Element)) {
                logger.warn("Skipping because no " + Element.class.getSimpleName());
                continue;
            }
            Element factoryOption = (Element) factoryOptionNode;

            FactoryData factory = new FactoryData();

            // class name
            String factoryClassName = factoryOption.getAttributeValue(FACTORY_CLASS_ARG);
            factory.type = (getTrimmedValue(factoryClassName));

            // options
            Map<String, String> options = parseOptions(factoryOption);
            factory.params = (options);

            // check that a configuration for this element doesn't already exist
            if (config.factories.containsKey(factory.type)) {
                logger.warn("There is already a configuration for factory class " + factory.type);
            }
            logger.debug("Add factory: " + factory.type);
            config.factories.put(factory.type, factory);

        }

    }

    private void parseCoordinateTransformer(Document doc) throws ParseException {
        logger.debug("Parsing coordinate transformer settings");

        Nodes memoryOptions = doc.query("/" + ROOT_ELEMENT_NAME + "/" + TRANSFORMER_ELEMENT_NAME);
        for (int i = 0; i < memoryOptions.size(); i++) {

            Node transformerNode = memoryOptions.get(i);
            logger.debug("Possible " + TRANSFORMER_ELEMENT_NAME + ": " + transformerNode.toXML());
            if (!(transformerNode instanceof Element)) {
                logger.warn("Skipping because no " + Element.class.getSimpleName());
                continue;
            }
            Element transformer = (Element) transformerNode;

            TransformerData confTransformer = new TransformerData();

            // factory
            String factory = transformer.getAttributeValue(FACTORY_CLASS_ARG);
            confTransformer.factory = (getTrimmedValue(factory));

            // class name
            String className = transformer.getAttributeValue(TRANSFORMER_CLASS_ARG);
            confTransformer.clazz = (getTrimmedValue(className));

            // options
            Element optionsElement = transformer.getFirstChildElement(OPTIONS_ELEMENT_NAME);

            Map<String, String> options = parseOptions(optionsElement);
            confTransformer.params = (options);

            config.transformer = confTransformer;
        }
    }

    private void parseWorkingMemories(Document doc) throws ParseException {

        logger.debug("Parsing working memory settings");

        Nodes memoryOptions = doc.query("/" + ROOT_ELEMENT_NAME + "/" + MEMORY_ELEMENT_NAME);
        for (int i = 0; i < memoryOptions.size(); i++) {

            Node memoryNode = memoryOptions.get(i);
            logger.debug("Possible " + MEMORY_ELEMENT_NAME + ": " + memoryNode.toXML());
            if (!(memoryNode instanceof Element)) {
                logger.warn("Skipping because no " + Element.class.getSimpleName());
                continue;
            }
            Element memory = (Element) memoryNode;

            MemoryData confMemory = new MemoryData();

            // key
            String key = memory.getAttributeValue(MEMORY_KEY_ARG);
            confMemory.id = (getTrimmedValue(key));

            // factory
            String factory = memory.getAttributeValue(FACTORY_CLASS_ARG);
            confMemory.factory = (getTrimmedValue(factory));

            // class name
            String className = memory.getAttributeValue(MEMORY_CLASS_ARG);
            confMemory.clazz = (getTrimmedValue(className));

            // options
            Element optionsElement = memory.getFirstChildElement(OPTIONS_ELEMENT_NAME);
            Map<String, String> options = parseOptions(optionsElement);
            confMemory.params = (options);

            // check that a configuration for this element doesn't already exist
            if (config.memories.containsKey(confMemory.id)) {
                logger.warn("There is already a configuration for working memory key " + confMemory.id);
            }
            config.memories.put(confMemory.id, confMemory);

        }

    }

    private void parseSensors(Document doc) throws ParseException {

        logger.debug("Parsing sensors");

        Nodes sensorNodes = doc.query("/" + ROOT_ELEMENT_NAME + "/" + SENSOR_ELEMENT_NAME);
        for (int i = 0; i < sensorNodes.size(); i++) {

            Node sensorNode = sensorNodes.get(i);
            logger.debug("Possible " + SENSOR_ELEMENT_NAME + ": " + sensorNode.toXML());
            if (!(sensorNode instanceof Element)) {
                logger.warn("Skipping because no " + Element.class.getSimpleName());
                continue;
            }
            Element sensor = (Element) sensorNode;

            SensorData configuredSensor = new SensorData();

            // key
            String key = sensor.getAttributeValue(SENSOR_KEY_ARG);
            configuredSensor.id = (getTrimmedValue(key));

            // data type class
            String dataTypeClass = sensor.getAttributeValue(DATA_TYPE_CLASS_ARG);
            configuredSensor.dataType = (getTrimmedValue(dataTypeClass));

            // data type class
            String listTypeClass = sensor.getAttributeValue(LIST_TYPE_CLASS_ARG);
            if (listTypeClass != null) {
                logger.debug("This sensor expects a list");
                configuredSensor.listType = (getTrimmedValue(listTypeClass));
            }

            // factory class
            String factoryClass = sensor.getAttributeValue(FACTORY_CLASS_ARG);
            configuredSensor.factory = (getTrimmedValue(factoryClass));

            // sensor class
            String sensorClass = sensor.getAttributeValue(SENSOR_CLASS_ARG);
            configuredSensor.sensorClass = (getTrimmedValue(sensorClass));

            String wireClass = sensor.getAttributeValue(WIRE_TYPE_CLASS_ARG);
            configuredSensor.wireType = (getTrimmedValue(wireClass));

            // options
            Element optionElement = sensor.getFirstChildElement(OPTIONS_ELEMENT_NAME);

            configuredSensor.params = (parseOptions(optionElement));

            // check that a sensor with this key doesn't already exist
            if (config.sensors.containsKey(configuredSensor.id)) {
                logger.warn("There is already a sensor for key " + configuredSensor.id);
            }
            config.sensors.put(configuredSensor.id, configuredSensor);

        }

    }

    private void parseActuators(Document doc) throws ParseException {

        logger.debug("Parsing actuators");

        Nodes actuatorNodes = doc.query("/" + ROOT_ELEMENT_NAME + "/" + ACTUATOR_ELEMENT_NAME);
        for (int i = 0; i < actuatorNodes.size(); i++) {

            Node actuatorNode = actuatorNodes.get(i);
            logger.debug("Possible " + ACTUATOR_ELEMENT_NAME + ": " + actuatorNode.toXML());
            if (!(actuatorNode instanceof Element)) {
                logger.warn("Skipping because no " + Element.class.getSimpleName());
                continue;
            }
            Element sensor = (Element) actuatorNode;

            ActuatorData configuredActuator = new ActuatorData();

            // key
            String key = sensor.getAttributeValue(ACTUATOR_KEY_ARG);
            configuredActuator.id = (getTrimmedValue(key));

            // actuator class
            String actuatorClass = sensor.getAttributeValue(ACTUATOR_CLASS_ARG);
            configuredActuator.clazz = (getTrimmedValue(actuatorClass));

            // factory class
            String factoryClass = sensor.getAttributeValue(FACTORY_CLASS_ARG);
            configuredActuator.factory = (getTrimmedValue(factoryClass));

            // interface
            String interfaceClass = sensor.getAttributeValue(ACTUATOR_INTERFACE_ARG);
            configuredActuator.inf = (getTrimmedValue(interfaceClass));

            // options
            Element optionElement = sensor.getFirstChildElement(OPTIONS_ELEMENT_NAME);
            configuredActuator.params = (parseOptions(optionElement));

            // check that a sensor with this key doesn't already exist
            if (config.actuators.containsKey(configuredActuator.id)) {
                logger.warn("There is already a actuator for key " + configuredActuator.id);
            }
            config.actuators.put(configuredActuator.id, configuredActuator);

        }

    }

    private Map<String, String> parseOptions(Element optionRoot) throws ParseException {

        Map<String, String> options = new HashMap<>();
        if (null == optionRoot) {
            return options;
        }
        logger.debug("Parsing options in root: " + optionRoot.toXML());

        Nodes optionNodes = optionRoot.query(OPTION_ELEMENT_NAME);
        for (int i = 0; i < optionNodes.size(); i++) {

            Node optionNode = optionNodes.get(i);
            logger.debug("Possible " + OPTION_ELEMENT_NAME + ": " + optionNode.toXML());
            if (!(optionNode instanceof Element)) {
                logger.warn("Skipping because no " + Element.class.getSimpleName());
                continue;
            }
            Element option = (Element) optionNode;

            String key = getTrimmedValue(option.getAttributeValue(OPTION_KEY_ARG));
            String value = getTrimmedValue(option.getValue());

            options.put(key, value);

        }

        return options;

    }

//    private Set<ConfiguredMemorySlot> parseSlots(Element slotRoot) throws ParseException {
//
//        logger.debug("Parsing slots in root: " + slotRoot.toXML());
//
//        Set<ConfiguredMemorySlot> slots = new HashSet<ConfiguredMemorySlot>();
//
//        Nodes slotNodes = slotRoot.query(SLOT_ELEMENT_NAME);
//        for (int i = 0; i < slotNodes.size(); i++) {
//
//            Node slotNode = slotNodes.get(i);
//            logger.debug("Possible " + SLOT_ELEMENT_NAME + ": " + slotNode.toXML());
//            if (!(slotNode instanceof Element)) {
//                logger.warn("Skipping because no " + Element.class.getSimpleName());
//                continue;
//            }
//            Element slot = (Element) slotNode;
//
//            ConfiguredMemorySlot confSlot = new ConfiguredMemorySlot();
//            confSlot.setDataType(getTrimmedValue(slot.getAttributeValue(DATA_TYPE_CLASS_ARG)));
//            confSlot.setSlotClassName(getTrimmedValue(slot.getAttributeValue(SLOT_CLASS_ARG)));
//
//            slots.add(confSlot);
//        }
//
//        return slots;
//
//    }

    /**
     * Returns a trimmed value of the given string and throws {@link ParseException} for every error that can occur.
     * This may be a <code>null</code> value or an empty string.
     *
     * @param rawValue value to trim, may be <code>null</code>
     * @return trimmed string value, not <code>null</code>
     * @throws ParseException empty string or <code>null</code> value
     */
    private String getTrimmedValue(String rawValue) throws ParseException {

        if (rawValue == null) {
            throw new ParseException("Null value");
        }
        String finalValue = rawValue.trim();
        if (finalValue.isEmpty()) {
            throw new ParseException("Empty value");
        }

        return finalValue;

    }

    @Override
    public BonsaiConfigurationData getconfiguration() {

        if (!parsingCompleted) {
            throw new IllegalStateException("Parsing was not invoked or failed. " + "No results can be fetched.");
        }

        return config;
    }
}
