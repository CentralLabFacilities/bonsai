package de.unibi.citec.clf.bonsai.core;


import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationParser;
import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationResults;
import de.unibi.citec.clf.bonsai.core.configuration.FactoryConfigurationResults;
import de.unibi.citec.clf.bonsai.core.configuration.XmlConfigurationParser;
import de.unibi.citec.clf.bonsai.core.configuration.data.*;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.exception.InitializationException;
import de.unibi.citec.clf.bonsai.core.exception.ParseException;
import de.unibi.citec.clf.bonsai.core.object.*;
import de.unibi.citec.clf.bonsai.util.MapReader;
import de.unibi.citec.clf.bonsai.util.helper.ListClass;
import org.apache.log4j.Logger;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.*;
import java.util.Map.Entry;

/**
 * Central access point to the Bonsai classes. This class provides various methods to create {@link Sensor}s and
 * {@link Actuator}s. The general usage pattern is to first configure the factory via a user-provided configuration
 * file. The default parser is XML-based but can be changed if desired. Afterwards the configured {@link Sensor}s and
 * {@link Actuator}s can be retrieved via the <code>create...</code> methods. A {@link Sensor} itself is not thread-safe
 * if not stated otherwise in the implementing class. The same counts for actuators.
 * <p>
 * This class is implemented as a singleton.
 *
 * @author sebschne
 * @author lkettenb
 * @author nkoester
 * @author jwienke
 * @author lziegler
 */
public class BonsaiManager {

    private Logger logger = Logger.getLogger(getClass());
    /**
     * The parser instance used for initial configuration.
     * <p>
     * {@link BonsaiManager} does not need a {@link ConfigurationParser}. Use {@link BonsaiManager#configure(String, ConfigurationParser)}  or
     * {@link BonsaiManager#configure(URI, ConfigurationParser)}
     * instead.
     */
    @Deprecated
    private ConfigurationParser configurationParser = new XmlConfigurationParser();
    /**
     * A map of configured factories indexed by their class.
     */
    private Map<Class<? extends CoreObjectFactory>, CoreObjectFactory> configuredFactoriesByClass = new HashMap<>();
    /**
     * Maps every configured working memory by key to its creating factory.
     */
    private Map<String, CoreObjectFactory> memoryKeysToFactories = new HashMap<>();
    /**
     * Maps every configured sensor by key to its creating factory.
     */
    private Map<String, CoreObjectFactory> sensorKeysToFactories = new HashMap<>();
    /**
     * Maps every configured actuator by key to its creating factory.
     */
    private Map<String, CoreObjectFactory> actuatorKeysToFactories = new HashMap<>();
    /**
     * The factory instance that is responsible for coordinate transforms.
     */
    private CoreObjectFactory coordinateFactory = null;
    /**
     * Singleton instance variable.
     */
    private static BonsaiManager instance = new BonsaiManager();
    private String oldConfig;


    private boolean OPTION_CACHE_CONFIG = false;

    /**
     * Private constructor for singleton pattern.
     */
    private BonsaiManager() {
    }

    private void configureBonsaiOptions(Map<String,String> options) {
        try {
            OPTION_CACHE_CONFIG = MapReader.readConfigBool("CACHE_CONFIG", OPTION_CACHE_CONFIG, options);
        } catch (MapReader.KeyNotFound e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Only for testing!!! Don't use this!
     */
    static void testConstructNewInstance() {
        instance = new BonsaiManager();
    }

    /**
     * Returns the singleton instance of this class.
     *
     * @return one and only instance of this class
     */
    public static BonsaiManager getInstance() {
        return instance;
    }

    /**
     * Sets the parser to use for the {@link #configure(String)} call.
     *
     * @param parser new parser to use
     * @deprecated {@link BonsaiManager} does not need a {@link ConfigurationParser}. Use      {@link BonsaiManager#configure(java.lang.String,
     * ConfigurationParser)} or      {@link BonsaiManager#configure(java.net.URI,
     * ConfigurationParser)} instead.
     */
    @Deprecated
    public void setParser(ConfigurationParser parser) {
        configurationParser = parser;
    }

    /**
     * Returns the parser instance used for initial configuration.
     *
     * @return current parser instance
     * @deprecated Use
     * {@link BonsaiManager#configure(java.lang.String, ConfigurationParser)}
     * or {@link BonsaiManager#configure(java.net.URI, ConfigurationParser)}
     * instead.
     */
    @Deprecated
    public ConfigurationParser getParser() {
        return configurationParser;
    }

    /**
     * Returns the set of configured factory classes after configuration via {@link #configure(URI)}.
     *
     * @return set of configured factory classes
     */
    public Set<Class<? extends CoreObjectFactory>> getConfiguredFactoryClasses() {
        return configuredFactoriesByClass.keySet();
    }

    /**
     * Configures the factory from a given configuration file with the parser set at a call to
     * {@link #setParser(ConfigurationParser)}. Default parser is XML based.
     *
     * @param configurationFilename Path to the local configuration file.
     * @throws IllegalStateException  already configured or error while configuring
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards
     * @deprecated Use {@link BonsaiManager#configure(java.lang.String, ConfigurationParser)} or
     * {@link BonsaiManager#configure(java.net.URI, ConfigurationParser)} instead.
     */
    @Deprecated
    public ConfigurationResults configure(String configurationFilename) throws ConfigurationException {
        try {
            return configure(new URI("file://" + configurationFilename.replace(" ", "%20")));
        } catch (URISyntaxException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Configures the factory from a given configuration file with the parser set at a call to
     * {@link #setParser(ConfigurationParser)}. Default parser is XML based.
     *
     * @param configurationFilename Path to the local configuration file.
     * @param parser                Parser to parse the given file.
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards
     */
    public ConfigurationResults configure(String configurationFilename, ConfigurationParser parser)
            throws ConfigurationException {
        try {
            return configure(new URI(configurationFilename.replace(" ", "%20")), parser);
        } catch (URISyntaxException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Configures the factory from a given configuration file with the parser set at a call to
     * {@link #setParser(ConfigurationParser)}. Default parser is XML based.
     *
     * @param configurationFile URI of the configuration file
     * @throws IllegalStateException  error while configuring
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards
     * @deprecated Use {@link BonsaiManager#configure(java.lang.String, ConfigurationParser)} or
     * {@link BonsaiManager#configure(java.net.URI, ConfigurationParser)} instead.
     */
    @Deprecated
    public ConfigurationResults configure(URI configurationFile) throws IllegalStateException, ConfigurationException {
        return configure(configurationFile, configurationParser);
    }

    /**
     * Configures the factory from a given configuration file.
     *
     * @param configurationFile URI of the configuration file
     * @param parser            Parser to parse the given file.
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards.
     */
    public ConfigurationResults configure(URI configurationFile, ConfigurationParser parser)
            throws ConfigurationException {
        return configure(configurationFile, parser, null, null, null, null);
    }

    /**
     * Configures the factory from a given configuration stream.
     *
     * @param configurationStream Stream of the configuration file
     * @param parser              Parser to parse the given file.
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards.
     */
    public ConfigurationResults configure(InputStream configurationStream, ConfigurationParser parser)
            throws ConfigurationException {
        return configure(configurationStream, parser, null, null, null, null);
    }

    /**
     * Configures the factory from a given configuration file.
     *
     * @param configuration String of the configuration
     * @param parser        Parser to parse the given file.
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards.
     */
    public ConfigurationResults configureByString(String configuration, ConfigurationParser parser)
            throws ConfigurationException {
        return configureByString(configuration, parser, null, null, null, null);
    }

    /**
     * Configures the factory from a given configuration file, but only sensors, actuators and memory slots that are
     * consistent with the given maps. These maps may be set null to configure all sensors, actuators or memory slots.
     *
     * @param configurationFile Path to the configuration file
     * @param parser            Parser to parse the given file.
     * @param sensorKeySet      Map that contains all required sensor keys.
     * @param listSensorKeySet  Set that contains all required list sensor keys.
     * @param actuatorKeySet    Set that contains all required actuator keys.
     * @param memoryKeySet      Set that contains all required working memory keys.
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards.
     */
    public ConfigurationResults configure(String configurationFile, ConfigurationParser parser,
                                          Set<String> sensorKeySet, Set<String> listSensorKeySet, Set<String> actuatorKeySet, Set<String> memoryKeySet)
            throws ConfigurationException {

        return configure(new File(configurationFile).toURI(), parser, sensorKeySet, listSensorKeySet,
                actuatorKeySet, memoryKeySet);

    }

    /**
     * Configures the factory from a given configuration file, but only sensors, actuators and memory slots that are
     * consistent with the given maps. These maps may be set null to configure all sensors, actuators or memory slots.
     *
     * @param configuration     String of the configuration file
     * @param parser            Parser to parse the given file.
     * @param aSensorKeySet     Map that contains all required sensor keys.
     * @param aListSensorKeySet Set that contains all required list sensor keys.
     * @param aActuatorKeySet   Set that contains all required actuator keys.
     * @param aMemoryKeySet     Set that contains all required working memory keys.
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards.
     */
    public ConfigurationResults configureByString(String configuration, ConfigurationParser parser,
                                                  Set<String> aSensorKeySet, Set<String> aListSensorKeySet, Set<String> aActuatorKeySet,
                                                  Set<String> aMemoryKeySet) throws ConfigurationException {
        logger.trace("Parsing configuration file");
        try {
            logger.trace("Parsing configuration file");
            parser.parse(configuration);
            return configure(parser, aSensorKeySet, aListSensorKeySet, aActuatorKeySet, aMemoryKeySet);
        } catch (ParseException e) {
            throw new ConfigurationException("Error parsing the configuration file \"" + configuration
                    + "\". Message (ParseException): " + e.getMessage(), e);
        } catch (IOException e) {
            throw new ConfigurationException("Error parsing the configuration file \"" + configuration
                    + "\". Message (IOException): " + e.getMessage(), e);
        } catch (IllegalStateException e) {
            throw new ConfigurationException("Error parsing the configuration file \"" + configuration
                    + "\". Message (IllegalStateException): " + e.getMessage(), e);
        }
    }

    /**
     * Configures the factory from a given configuration file, but only sensors, actuators and memory slots that are
     * consistent with the given maps. These maps may be set null to configure all sensors, actuators or memory slots.
     *
     * @param configurationFile URI of the configuration file
     * @param parser            Parser to parse the given file.
     * @param aSensorKeySet     Map that contains all required sensor keys.
     * @param aListSensorKeySet Set that contains all required list sensor keys.
     * @param aActuatorKeySet   Set that contains all required actuator keys.
     * @param aMemoryKeySet     Set that contains all required working memory keys.
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards.
     */
    public ConfigurationResults configure(URI configurationFile, ConfigurationParser parser, Set<String> aSensorKeySet,
                                          Set<String> aListSensorKeySet, Set<String> aActuatorKeySet, Set<String> aMemoryKeySet)
            throws ConfigurationException {
        try {
            logger.trace("Parsing configuration file");
            parser.parse(configurationFile);
            return configure(parser, aSensorKeySet, aListSensorKeySet, aActuatorKeySet,
                    aMemoryKeySet);
        } catch (ParseException e) {
            throw new ConfigurationException(
                    "Error parsing the configuration stream. Message (ParseException): "
                            + e.getMessage(), e);
        } catch (IOException e) {
            throw new ConfigurationException(
                    "Error parsing the configuration stream. Message (IOException): "
                            + e.getMessage(), e);
        } catch (IllegalStateException e) {
            throw new ConfigurationException(
                    "Error parsing the configuration stream. Message (IllegalStateException): "
                            + e.getMessage(), e);
        }
    }

    /**
     * Configures the factory from a given configuration file, but only sensors, actuators and memory slots that are
     * consistent with the given maps. These maps may be set null to configure all sensors, actuators or memory slots.
     *
     * @param configurationStream Stream of the configuration file
     * @param parser              Parser to parse the given file.
     * @param aSensorKeySet       Map that contains all required sensor keys.
     * @param aListSensorKeySet   Set that contains all required/** list sensor keys.
     * @param aActuatorKeySet     Set that contains all required actuator keys.
     * @param aMemoryKeySet       Set that contains all required working memory keys.
     * @throws ConfigurationException error configuring the {@link BonsaiManager}. If this is the case, this class is in
     *                                an unpredictable state and cannot be used afterwards.
     */
    public ConfigurationResults configure(InputStream configurationStream,
                                          ConfigurationParser parser, Set<String> aSensorKeySet, Set<String> aListSensorKeySet,
                                          Set<String> aActuatorKeySet, Set<String> aMemoryKeySet) throws ConfigurationException {
        try {
            logger.trace("Parsing configuration file");
            parser.parse(configurationStream);
            return configure(parser, aSensorKeySet, aListSensorKeySet, aActuatorKeySet,
                    aMemoryKeySet);
        } catch (ParseException e) {
            throw new ConfigurationException(
                    "Error parsing the configuration stream. Message (ParseException): "
                            + e.getMessage(), e);
        } catch (IOException e) {
            throw new ConfigurationException(
                    "Error parsing the configuration stream. Message (IOException): "
                            + e.getMessage(), e);
        } catch (IllegalStateException e) {
            throw new ConfigurationException(
                    "Error parsing the configuration stream. Message (IllegalStateException): "
                            + e.getMessage(), e);
        }
    }

    public ConfigurationResults configure(ConfigurationParser parser, Set<String> aSensorKeySet,
                                          Set<String> aListSensorKeySet, Set<String> aActuatorKeySet, Set<String> aMemoryKeySet)
            throws ConfigurationException {

        ConfigurationResults results = new ConfigurationResults();
        BonsaiConfigurationData config = parser.getconfiguration();
        Set<String> sensorKeySet = aSensorKeySet == null ? null : new HashSet<>(aSensorKeySet);
        Set<String> listSensorKeySet = aListSensorKeySet == null ? null : new HashSet<>(aListSensorKeySet);
        Set<String> actuatorKeySet = aActuatorKeySet == null ? null : new HashSet<>(aActuatorKeySet);
        Set<String> memoryKeySet = aMemoryKeySet == null ? null : new HashSet<>(aMemoryKeySet);

        configureBonsaiOptions(config.options);

        if (OPTION_CACHE_CONFIG && oldConfig != null && oldConfig.equals(parser.getHash())) {
            // Skip creation
            logger.fatal("SKIP CREATION");
        } else {
            logger.trace("Creating factories");
            createFactories(config.factories.values());
            oldConfig = parser.getHash();
        }

        logger.trace("Initializing coordinate transformer");
        results.merge(initializeCoordinateTransformer(config.transformer));

        // load only bonsais from the given key sets
        Map<String, MemoryData> requiredMemory = new HashMap<>();
        if (memoryKeySet != null) {
            for (String m : new ArrayList<>(memoryKeySet)) {
                if (config.memories.containsKey(m)) {
                    requiredMemory.put(m, config.memories.get(m));
                    memoryKeySet.remove(m);
                }
            }
        } else {
            requiredMemory = config.memories;
        }

        Map<String, SensorData> requiredSensors = new HashMap<>();
        if (sensorKeySet != null || listSensorKeySet != null) {
            for (String s : config.sensors.keySet()) {
                if (sensorKeySet != null && sensorKeySet.contains(s)) {
                    requiredSensors.put(s, config.sensors.get(s));
                    sensorKeySet.remove(s);
                }
                if (listSensorKeySet != null && listSensorKeySet.contains(s)) {
                    requiredSensors.put(s, config.sensors.get(s));
                    listSensorKeySet.remove(s);
                }
            }
        } else {
            requiredSensors = config.sensors;
        }

        Map<String, ActuatorData> requiredActuator = new HashMap<>();
        if (actuatorKeySet != null) {
            logger.trace("have required actuators");
            for (String m : new ArrayList<>(actuatorKeySet)) {
                logger.trace("key: " + m);
                if (config.actuators.containsKey(m)) {
                    requiredActuator.put(m, config.actuators.get(m));
                    actuatorKeySet.remove(m);
                } else {
                    logger.trace("key not found:");
                    logger.trace(config.actuators.size());
                    config.actuators.entrySet().forEach((asd) -> {
                        logger.trace("have key: " + asd.getKey());
                    });
                }
            }
        } else {
            requiredActuator = config.actuators;
        }


        logger.debug("Initializing working memories");
        results.merge(initializeWorkingMemories(requiredMemory.values()));

        logger.debug("Initializing sensors per factory");
        results.merge(initializeSensors(requiredSensors.values()));

        logger.debug("Initializing actuators per factory");
        results.merge(initializeActuators(requiredActuator.values()));

        logger.debug("trigger object creation");
        configuredFactoriesByClass.entrySet().stream().map((entry) -> entry.getValue()).forEachOrdered((factory) -> {
            results.otherExceptions.addAll(factory.createAndCacheAllConfiguredObjects().exceptions);
        });

        // Required working memory left?
        if (memoryKeySet != null && !memoryKeySet.isEmpty()) {
            String missingM = "";
            for (String key : memoryKeySet) {
                missingM += "'" + key + "' ";
            }
            ConfigurationException e = new ConfigurationException("The following wokring "
                    + " memories have not been configured: " + missingM);
            logger.error(e.getMessage());
            logger.debug(e);
            results.add(e);

        }
        // Required sensors left?
        if (sensorKeySet != null && !sensorKeySet.isEmpty()) {
            String missingS = "";
            for (String key : sensorKeySet) {
                missingS += "'" + key + "' ";
            }
            ConfigurationException e = new ConfigurationException("The following sensors "
                    + "have not been configured: " + missingS);
            logger.error(e.getMessage());
            logger.debug(e);
            results.add(e);
        }
        if (listSensorKeySet != null && !listSensorKeySet.isEmpty()) {
            String missingS = "";
            for (String key : listSensorKeySet) {
                missingS += "'" + key + "' ";
            }
            ConfigurationException e = new ConfigurationException("The following sensors "
                    + "have not been configured: " + missingS);
            logger.error(e.getMessage());
            logger.debug(e);
            results.add(e);
        }
        // Required actuators left?
        if (actuatorKeySet != null && !actuatorKeySet.isEmpty()) {
            String missingA = "";
            for (String key : actuatorKeySet) {
                missingA += "'" + key + "' ";
            }
            ConfigurationException e = new ConfigurationException("The following actuators "
                    + "have not been configured: " + missingA);
            logger.error(e.getMessage());
            logger.debug(e);
            results.add(e);
        }
        return results;
    }

    /**
     * Indicates whether the factory can create a sensor with the unique key <code>key</code> and the data type class
     * <code>dataType</code>.
     *
     * @param key      key of the sensor to check
     * @param dataType data type of the sensor with the given key to return
     * @return <code>true</code> if there is a factory that was configured for sensors with the specified key and return
     * data type, else <code>false</code>
     */
    public boolean canCreateSensor(String key, Class<?> dataType) {
        logger.debug("Checking if an sensor of key '" + key + "' can be created with interface class " + dataType);

        if (!sensorKeysToFactories.containsKey(key)) {
            logger.debug("No key in map for this sensor.");
            return false;
        }
        if (!sensorKeysToFactories.get(key).canCreateSensor(key, dataType)) {
            logger.debug("Factory " + sensorKeysToFactories.get(key) + " cannot create sensor.");
            return false;
        }
        logger.debug("Can create sensor.");
        return true;
    }

    /**
     * Indicates whether the factory can create all given sensors.
     *
     * @param sensors Map of sensor keys and data types.
     * @return <code>true</code> if there is a configured factory for each sensor, else <code>false</code>
     */
    public ConfigurationResults canCreateSensors(Map<String, Class<?>> sensors) {
        ConfigurationResults ret = new ConfigurationResults();
        for (String key : sensors.keySet()) {
            if (!canCreateSensor(key, sensors.get(key))) {
                ret.add(new ConfigurationException("Can not create sensor with key '" + key + "' and data type "
                        + sensors.get(key)));
            }
        }
        return ret;
    }

    /**
     * Indicates whether the factory can create a sensor with the unique key <code>key</code>, and the list type class
     * <code>listType</code> and the data type class <code>dataType</code>.
     *
     * @param key      key of the sensor to check
     * @param listType list type of the sensor with the given key to return
     * @param dataType data type of the list values
     * @return <code>true</code> if there is a factory that was configured for sensor with the specified key and return
     * data type, else <code>false</code>
     */
    public boolean canCreateSensor(String key, Class<? extends List<?>> listType, Class<?> dataType) {
        logger.debug("Checking if an sensor of key '" + key + "' can be created with interface class " + dataType
                + " and list tpye " + listType);

        if (!sensorKeysToFactories.containsKey(key)) {
            logger.debug("No key in map for this sensor.");
            return false;
        }
        if (!sensorKeysToFactories.get(key).canCreateSensor(key, listType, dataType)) {
            logger.debug("Factory " + sensorKeysToFactories.get(key) + " cannot create sensor.");
            return false;
        }
        logger.debug("Can create sensor.");
        return true;
    }

    /**
     * Indicates whether the factory can create all given list sensors.
     *
     * @param sensors Map of sensor keys and {@link ListClass}.
     * @return <code>true</code> if there is a configured factory for each sensor, else <code>false</code>
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    public ConfigurationResults canCreateListSensors(Map<String, ListClass> sensors) {
        ConfigurationResults ret = new ConfigurationResults();
        for (String key : sensors.keySet()) {
            if (!canCreateSensor(key, sensors.get(key).listType, sensors.get(key).dataType)) {
                ret.add(new ConfigurationException("Can not create list sensor with key '" + key + "' and data type "
                        + sensors.get(key).dataType + " and list type " + sensors.get(key).listType));
            }
        }
        return ret;
    }

    /**
     * Tests if an actuator of the desired class can be created. The desired class is interpreted as the minimally
     * fulfilled interface.
     *
     * @param key           key of the actuator
     * @param actuatorClass minimal interface an actuator under the given key must implement
     * @return <code>true</code> if such an actuator can be created, else <code>false</code>
     */
    public boolean canCreateActuator(String key, Class<? extends Actuator> actuatorClass) {
        logger.debug("Checking if an actuator of key '" + key + "' can be created with interface class "
                + actuatorClass);

        if (!actuatorKeysToFactories.containsKey(key)) {
            logger.debug("No key in map for this actuator.");
            return false;
        }
        if (!actuatorKeysToFactories.get(key).canCreateActuator(key, actuatorClass)) {
            logger.debug("Factory " + actuatorKeysToFactories.get(key) + " cannot create actuator.");
            return false;
        }
        logger.debug("Can create actuator.");
        return true;
    }

    /**
     * Indicates whether the factory can create all given actuators.
     *
     * @param actuators Map of actuators keys and data types.
     * @return <code>true</code> if there is a configured factory for each actuator, else <code>false</code>
     */
    public ConfigurationResults canCreateActuators(Map<String, Class<? extends Actuator>> actuators) {
        ConfigurationResults ret = new ConfigurationResults();
        for (String key : actuators.keySet()) {
            if (!canCreateActuator(key, actuators.get(key))) {
                ret.add(new ConfigurationException("Can not create actuator with key '" + key + "' and actuator type "
                        + actuators.get(key)));
            }
        }
        return ret;
    }

    /**
     * Tests if an working memory can be created.
     *
     * @param key key of the working memory
     * @return <code>true</code> if such an working memory can be created, else <code>false</code>
     */
    public boolean canCreateWorkingMemory(String key) {
        logger.debug("Checking if an working memory of key '" + key + "' can be created.");

        if (!memoryKeysToFactories.containsKey(key)) {
            logger.debug("No key in map for this working memory.");
            return false;
        }
        if (!memoryKeysToFactories.get(key).canCreateWorkingMemory(key)) {
            logger.debug("Factory " + memoryKeysToFactories.get(key) + " cannot create working memory.");
            return false;
        }
        logger.debug("Can create working memory.");
        return true;
    }

    /**
     * Indicates whether the factory can create all given working memories.
     *
     * @param keys Set of working memories keys.
     * @return <code>true</code> if there is a configured factory for each working memory, else <code>false</code>
     */
    public ConfigurationResults canCreateWorkingMemories(Set<String> keys) {
        ConfigurationResults ret = new ConfigurationResults();
        for (String key : keys) {
            if (!canCreateWorkingMemory(key)) {
                ret.add(new ConfigurationException("Can not create working memory with key '" + key + "'"));
            }
        }
        return ret;
    }

    /**
     * Factory method to create a new sensor for the given data type provided by the resulting sensor. A sensor with
     * this signature can only be created if a call to {@link #canCreateSensor(String, Class)} returned
     * <code>true</code>.
     *
     * @param <T>      data type of the sensor to create
     * @param key      key under which the sensor is registered in the configuration
     * @param dataType class object representing the data type of the sensor to create
     * @return new instance of the sensor
     * @throws IllegalArgumentException    there is no sensor for the given data type with the provided key
     * @throws CoreObjectCreationException error while creating the requested sensor
     */
    public <T> Sensor<T> createSensor(String key, Class<T> dataType) throws IllegalArgumentException,
            CoreObjectCreationException {

        logger.debug("Creating a sensor instance with key '" + key + "' and dataType '" + dataType + "'");

        if (!sensorKeysToFactories.containsKey(key)) {
            throw new IllegalArgumentException("No sensor with key '" + key + "'");
        }

        CoreObjectFactory factory = sensorKeysToFactories.get(key);
        assert factory != null;
        if (!factory.canCreateSensor(key, dataType)) {
            throw new IllegalArgumentException("Factory " + factory + " cannot create a sensor with key '" + key
                    + "' and dataType '" + dataType + "'.");
        }

        return factory.createSensor(key, dataType);

    }

    /**
     * Factory method to create a new sensor for the given list and data type provided by the resulting sensor. A sensor
     * with this signature can only be created if a call to {@link #canCreateSensor(String, Class, Class)} returned
     * <code>true</code>.
     *
     * @param <S>      list type of the sensor to create
     * @param <T>      data type of the sensor to create
     * @param key      key under which the sensor is registered in the configuration
     * @param listType class object representing the list type of the sensor to create
     * @param dataType class object representing the data type of the sensor to create
     * @return new instance of the sensor
     * @throws IllegalArgumentException    there is no sensor for the given data type with the provided key
     * @throws CoreObjectCreationException error while creating the requested sensor
     */
    public <S extends List<T>, T> Sensor<S> createSensor(String key, Class<S> listType, Class<T> dataType)
            throws IllegalArgumentException, CoreObjectCreationException {

        logger.debug("Creating a sensor instance with key '" + key + "', listType '" + listType + "' and dataType '"
                + dataType + "'");

        if (!sensorKeysToFactories.containsKey(key)) {
            throw new IllegalArgumentException("No sensor with key '" + key + "'");
        }

        CoreObjectFactory factory = sensorKeysToFactories.get(key);
        assert factory != null;
        if (!factory.canCreateSensor(key, listType, dataType)) {
            throw new IllegalArgumentException("Factory " + factory + " cannot create a list sensor with key '" + key
                    + "', lsitType '" + listType + "' and dataType '" + dataType + "'.");
        }

        return factory.createSensor(key, listType, dataType);

    }

    /**
     * Factory method to create a new actuator of the provided type.
     *
     * @param <T>           type of the actuator to create (minimally implemented interface)
     * @param key           key under which the actuator is registered in the configuration
     * @param actuatorClass class object representing the type of the actuator to create
     * @return new instance of the actuator
     * @throws IllegalArgumentException    there is no actuator for the given type with the provided key
     * @throws CoreObjectCreationException error while creating the requested actuator
     */
    public <T extends Actuator> T createActuator(String key, Class<T> actuatorClass) throws IllegalArgumentException,
            CoreObjectCreationException {

        logger.debug("Creating an actuator instance with key '" + key + "' and type '" + actuatorClass + "'");

        if (!actuatorKeysToFactories.containsKey(key)) {
            throw new IllegalArgumentException("No actuator with key '" + key + "'");
        }

        CoreObjectFactory factory = actuatorKeysToFactories.get(key);
        assert factory != null;
        if (!factory.canCreateActuator(key, actuatorClass)) {
            throw new IllegalArgumentException("Factory " + factory + " cannot create an actuator with key '" + key
                    + "' and type '" + actuatorClass + "'.");
        }

        return factory.createActuator(key, actuatorClass);

    }

    /**
     * Factory method to create a new working memory.
     *
     * @param key key under which the memory is registered in the configuration
     * @return new instance of the working memory
     * @throws IllegalArgumentException    there is no actuator for the given type with the provided key
     * @throws CoreObjectCreationException error while creating the requested actuator
     */
    public <T extends WorkingMemory> T createWorkingMemory(String key) throws IllegalArgumentException,
            CoreObjectCreationException {

        logger.debug("Creating an working memory instance with key '" + key + "'");

        if (!memoryKeysToFactories.containsKey(key)) {
            throw new IllegalArgumentException("No working memory with key '" + key + "'");
        }

        CoreObjectFactory factory = memoryKeysToFactories.get(key);
        assert factory != null;
        if (!factory.canCreateWorkingMemory(key)) {
            throw new IllegalArgumentException("Factory " + factory + " cannot create an working memory with key '"
                    + key + "'.");
        }

        return factory.createWorkingMemory(key);

    }

    /**
     * Factory method to create a new coordinate transformer.
     *
     * @return coordinate transformer
     */
    public TransformLookup createCoordinateTransformer() {
        logger.debug("Creating a coordinte transformer instance");

        assert coordinateFactory != null;
        if (!coordinateFactory.canCreateCoordinateTransformer()) {
            throw new IllegalArgumentException("Factory " + coordinateFactory + " cannot create coordinate transformers!");
        }

        return coordinateFactory.createCoordinateTransformer();
    }

    /**
     * Finds the factory with the given class name.
     *
     * @return factory with the given class name or <code>null</code> if not found
     */
    private Class<? extends CoreObjectFactory> findFactory(String className) {
        for (Class<? extends CoreObjectFactory> clazz : configuredFactoriesByClass.keySet()) {
            if (clazz.getName().equals(className)) {
                return clazz;
            }
        }
        return null;
    }

    /**
     * Initializes all configured sensors in their appropriate factories found in {@link #configuredFactoriesByClass}.
     * Afterwards the mapping {@link #sensorKeysToFactories} is populated.
     *
     * @param configuredSensors sensors to initialize
     * @throws ConfigurationException initialization error
     */
    private ConfigurationResults initializeSensors(Collection<SensorData> configuredSensors)
            throws ConfigurationException {
        sensorKeysToFactories = new HashMap<>();
        ConfigurationResults results = new ConfigurationResults();
        // first, map every configured sensor to the factory that creates it
        Map<CoreObjectFactory, Set<SensorToConfigure>> sensorToConfigureByFactory = mapConfiguredCoreObjectToFactories(
                configuredSensors, new CoreObjectMapper<SensorData, SensorToConfigure>() {
                    @Override
                    public SensorToConfigure map(SensorData t) throws ConfigurationException {
                        return mapSensor(t);
                    }
                });

        // then, initialize the sensors of every factory
        for (Entry<CoreObjectFactory, Set<SensorToConfigure>> factoryEntry : sensorToConfigureByFactory.entrySet()) {
            try {
                logger.debug("Factory " + factoryEntry.getKey() + ": " + factoryEntry.getValue());
                FactoryConfigurationResults factoryResults = factoryEntry.getKey().configureSensors(
                        factoryEntry.getValue());
                results.otherExceptions.addAll(factoryResults.exceptions);
            } catch (IllegalArgumentException e) {
                String message = "Error configuring a sensor for factory "
                        + factoryEntry.getKey().getClass().getSimpleName();
                logger.error(message);
                throw new ConfigurationException(message, e);
            } catch (CoreObjectCreationException e) {
                throw new ConfigurationException(e);
            }
        }

        // if the initialization was successful, populate the map of sensor
        // keys to factory objects
        logger.debug("Building map of initialized sensors");
        for (Entry<CoreObjectFactory, Set<SensorToConfigure>> factoryEntry : sensorToConfigureByFactory.entrySet()) {

            CoreObjectFactory factory = factoryEntry.getKey();
            logger.debug("   factory = " + factory);

            for (SensorToConfigure sensor : factoryEntry.getValue()) {

                logger.debug("      sensor = " + sensor);

                if (sensorKeysToFactories.containsKey(sensor.getKey())) {
                    ConfigurationException e = new ConfigurationException(
                            "There is already a sensor configured with key '" + sensor.getKey() + "'. "
                                    + "Cannot initialize another sensor" + " with this key: " + sensor);
                    logger.error(e.getMessage(), e);
                    results.add(e);
                } else {

                    sensorKeysToFactories.put(sensor.getKey(), factory);
                }
            }

        }
        return results;
    }

    /**
     * Initializes all configured actuators in their appropriate factories found in {@link #configuredFactoriesByClass}.
     * Afterwards the mapping {@link #actuatorKeysToFactories} is populated.
     *
     * @param configuredActuators actuators to initialize
     * @throws ConfigurationException initialization error
     */
    private ConfigurationResults initializeActuators(Collection<ActuatorData> configuredActuators)
            throws ConfigurationException {

        logger.trace("require actuators# " + configuredActuators.size());
        ConfigurationResults results = new ConfigurationResults();
        actuatorKeysToFactories = new HashMap<>();
        // map requested actuators to the factories that shall create them
        Map<CoreObjectFactory, Set<ActuatorToConfigure>> actuatorsToConfigureByFactory = mapConfiguredCoreObjectToFactories(configuredActuators, this::mapActuator);

        // initialize actuators in each factory
        for (Entry<CoreObjectFactory, Set<ActuatorToConfigure>> factoryEntry : actuatorsToConfigureByFactory.entrySet()) {
            try {
                logger.debug("Factory " + factoryEntry.getKey() + ": " + factoryEntry.getValue());
                FactoryConfigurationResults factoryResults = factoryEntry.getKey().configureActuators(
                        factoryEntry.getValue());
                results.otherExceptions.addAll(factoryResults.exceptions);
            } catch (IllegalArgumentException e) {
                String message = "Error configuring an actuator for factory "
                        + factoryEntry.getKey().getClass().getSimpleName();
                logger.error(message);
                throw new ConfigurationException(message, e);
            } catch (CoreObjectCreationException e) {
                throw new ConfigurationException(e);
            }
        }

        // build a mapping of actuator keys to creating factories
        logger.debug("Building map of initialized actuators");
        for (Entry<CoreObjectFactory, Set<ActuatorToConfigure>> factoryEntry : actuatorsToConfigureByFactory.entrySet()) {

            CoreObjectFactory factory = factoryEntry.getKey();
            logger.debug("   factory = " + factory);

            for (ActuatorToConfigure actuator : factoryEntry.getValue()) {

                logger.debug("      actuator = " + actuator);

                if (actuatorKeysToFactories.containsKey(actuator.getKey())) {
                    ConfigurationException e = new ConfigurationException(
                            "There is already an actuator configured with key '" + actuator.getKey() + "'. "
                                    + "Cannot initialize another actuator " + "with this key: " + actuator);
                    logger.error(e.getMessage(), e);
                    results.add(e);
                } else {
                    actuatorKeysToFactories.put(actuator.getKey(), factory);
                }
            }

        }
        return results;

    }

    @SuppressWarnings("unchecked")
    private ConfigurationResults initializeCoordinateTransformer(TransformerData configuredTransformer) {
        ConfigurationResults results = new ConfigurationResults();
        Set<TransformerData> all = new HashSet<>();
        if (configuredTransformer != null) {
            all.add(configuredTransformer);
        }
        Map<CoreObjectFactory, Set<CoordinateTransformerToConfigure>> transformersToConfigureByFactory = mapCoreObjectDataToFactories(all, t -> {

            CoordinateTransformerToConfigure transformer = new CoordinateTransformerToConfigure();

            transformer.setTransformerOptions(t.params);

            try {

                Class<?> possibleTransformerClass = Class.forName(t.clazz);
                if (!TransformLookup.class.isAssignableFrom(possibleTransformerClass)) {
                    throw new ConfigurationException("Class " + possibleTransformerClass + " does not implement interface "
                            + WorkingMemory.class);
                }
                transformer.setTransformerClass((Class<? extends TransformLookup>) possibleTransformerClass);

            } catch (ExceptionInInitializerError | ClassNotFoundException e) {
                throw new ConfigurationException(e);
            }
            return transformer;
        });

        // initialize transformer in each factory
        for (Entry<CoreObjectFactory, Set<CoordinateTransformerToConfigure>> factoryEntry : transformersToConfigureByFactory
                .entrySet()) {
            try {
                logger.debug("Factory " + factoryEntry.getKey() + ": " + factoryEntry.getValue());
                factoryEntry.getKey().configureCoordinateTransformer(factoryEntry.getValue().iterator().next());
            } catch (IllegalArgumentException e) {
                String message = "Error configuring a coordinate transformer for factory "
                        + factoryEntry.getKey().getClass().getSimpleName();
                logger.error(message);
                logger.error(e.getMessage());
                throw new ConfigurationException(message, e);
            } catch (CoreObjectCreationException e) {
                throw new ConfigurationException(e);
            }
        }

        // build a mapping of actuator keys to creating factories
        logger.debug("Building map of initialized coordinate transformers");
        for (Entry<CoreObjectFactory, Set<CoordinateTransformerToConfigure>> factoryEntry : transformersToConfigureByFactory.entrySet()) {

            CoreObjectFactory factory = factoryEntry.getKey();
            logger.debug("   factory = " + factory);

            for (CoordinateTransformerToConfigure transformer : factoryEntry.getValue()) {

                logger.debug("      transformer = " + transformer);

                coordinateFactory = factory;
            }

        }

        return results;
    }

    /**
     * Initializes all configured working memories in their appropriate factories found in
     * {@link #configuredFactoriesByClass}. Afterwards the mapping {@link #memoryKeysToFactories} is populated.
     *
     * @param configuredMemories working memories to initialize
     * @throws ConfigurationException initialization error
     */
    private ConfigurationResults initializeWorkingMemories(Collection<MemoryData> configuredMemories) {
        ConfigurationResults results = new ConfigurationResults();
        memoryKeysToFactories = new HashMap<>();
        // map requested actuators to the factories that shall create them
        Map<CoreObjectFactory, Set<WorkingMemoryToConfigure>> memoriesToConfigureByFactory = mapConfiguredCoreObjectToFactories(configuredMemories, this::mapWorkingMemory);

        // initialize memories in each factory
        for (Entry<CoreObjectFactory, Set<WorkingMemoryToConfigure>> factoryEntry : memoriesToConfigureByFactory
                .entrySet()) {
            try {
                logger.debug("Factory " + factoryEntry.getKey() + ": " + factoryEntry.getValue());
                factoryEntry.getKey().configureWorkingMemories(factoryEntry.getValue());
            } catch (IllegalArgumentException e) {
                String message = "Error configuring a working memory for factory "
                        + factoryEntry.getKey().getClass().getSimpleName();
                logger.error(message);
                logger.error(e.getMessage());
                throw new ConfigurationException(message, e);
            } catch (CoreObjectCreationException e) {
                throw new ConfigurationException(e);
            }
        }

        // build a mapping of slot keys to creating factories
        logger.debug("Building map of initialized working memorys");
        for (Entry<CoreObjectFactory, Set<WorkingMemoryToConfigure>> factoryEntry : memoriesToConfigureByFactory
                .entrySet()) {

            CoreObjectFactory factory = factoryEntry.getKey();
            logger.debug("   factory = " + factory);

            for (WorkingMemoryToConfigure memory : factoryEntry.getValue()) {

                logger.debug("      working memory = " + memory);

                if (memoryKeysToFactories.containsKey(memory.getKey())) {
                    ConfigurationException e = new ConfigurationException(
                            "There is already an working memory configured with key '" + memory.getKey() + "'. "
                                    + "Cannot initialize another working memory " + "with this key: " + memory);
                    logger.error(e.getMessage(), e);
                    results.add(e);
                } else {

                    memoryKeysToFactories.put(memory.getKey(), factory);
                }
            }

        }
        return results;
    }

    /**
     * Maps {@link ActuatorData}s to {@link ActuatorToConfigure}s with appropriate class checking.
     *
     * @param confAct actuator to map
     * @return mapped actuator
     * @throws ConfigurationException error while mapping, especially class finding errors
     */
    @SuppressWarnings("unchecked")
    private ActuatorToConfigure mapActuator(ActuatorData confAct) throws ConfigurationException {

        ActuatorToConfigure actuator = new ActuatorToConfigure();

        actuator.setKey(confAct.id);
        actuator.setActuatorOptions(confAct.params);
        //actuator.setInterfaceClass(confAct.);

        try {

            Class<?> possibleInterfaceClass = Class.forName(confAct.inf);
            if (!Actuator.class.isAssignableFrom(possibleInterfaceClass)) {
                throw new ConfigurationException("Class " + possibleInterfaceClass + " does not implement interface "
                        + Actuator.class);
            }
            actuator.setInterfaceClass((Class<? extends Actuator>) possibleInterfaceClass);

            Class<?> possibleActuatorClass = Class.forName(confAct.clazz);
            if (!Actuator.class.isAssignableFrom(possibleActuatorClass)) {
                throw new ConfigurationException("Class " + possibleActuatorClass + " does not implement interface "
                        + Actuator.class);
            }
            if (!actuator.getInterfaceClass().isAssignableFrom(possibleActuatorClass)) {
                throw new ConfigurationException("Class " + possibleActuatorClass + " does not implement its "
                        + "declared actuator interface " + actuator.getInterfaceClass());
            }
            actuator.setActuatorClass((Class<? extends Actuator>) possibleActuatorClass);

        } catch (ExceptionInInitializerError | ClassNotFoundException e) {
            throw new ConfigurationException(e);
        }
        return actuator;

    }

    /**
     * Maps all configured sensors given to the factory instances that create the sensor.
     *
     * @param <T>               type of the core objects to map
     * @param configuredObjects sensors to map
     * @param mapper            mapper from <code>T</code> to <code>U</code>
     * @return map that maps every given {@link SensorToConfigure} to the factory object that can create it
     * @throws ConfigurationException on of the sensors cannot be mapped to a factory instance
     */
    private <T extends CoreObjectData, U> Map<CoreObjectFactory, Set<U>> mapConfiguredCoreObjectToFactories(
            Collection<T> configuredObjects, CoreObjectMapper<T, U> mapper) throws ConfigurationException {

        logger.debug("Mapping ConfiguredObject to factories. Got " + configuredObjects.size() + " object(s) to map.");

        Map<CoreObjectFactory, Set<U>> coreObjectByFactory = new HashMap<>();

        for (T coreObject : configuredObjects) {

            Class<? extends CoreObjectFactory> factoryClass = findFactory(coreObject.factory);
            if (factoryClass == null) {
                throw new ConfigurationException("Cannot setup sensor with key '" + coreObject.id
                        + "' because there is no factory set up " + "with class '" + coreObject.factory
                        + "'");
            }

            CoreObjectFactory factory = configuredFactoriesByClass.get(factoryClass);
            assert factory != null : "We could find a factory with class " + factoryClass
                    + " so it must be contained in" + "the map of configured factories.";
            if (!coreObjectByFactory.containsKey(factory)) {
                coreObjectByFactory.put(factory, new HashSet<>());
            }
            logger.debug(coreObject + " belongs to " + factory);
            boolean notReplaced = coreObjectByFactory.get(factory).add(mapper.map(coreObject));
            assert notReplaced;

        }

        if (logger.isDebugEnabled()) {
            for (Entry<CoreObjectFactory, Set<U>> entry : coreObjectByFactory.entrySet()) {
                StringBuilder builder = new StringBuilder();
                builder.append("Mapping of objects to factories:\n");
                builder.append("   " + entry.getKey() + ":\n");
                for (U s : entry.getValue()) {
                    builder.append("      " + s + "\n");
                }
                logger.debug(builder.toString());
            }
        }

        return coreObjectByFactory;

    }

    /**
     * An interface describing a method to map one data type to another. This is used to map configuration objects from
     * {@link BonsaiManager} to instances of {@link CoreObjectData}.
     *
     * @param <T> source data type for the mapping
     * @param <U> target data type for the mapping
     * @author jwienke
     */
    private interface CoreObjectMapper<T, U> {

        U map(T t) throws ConfigurationException;
    }

    /**
     * Maps all configured sensors given to the factory instances that create the sensor.
     *
     * @param <T>               type of the core objects to map
     * @param configuredObjects sensors to map
     * @param mapper            mapper from <code>T</code> to <code>U</code>
     * @return map that maps every given {@link SensorToConfigure} to the factory object that can create it
     * @throws ConfigurationException on of the sensors cannot be mapped to a factory instance
     */
    private <T extends CoreObjectData, U> Map<CoreObjectFactory, Set<U>> mapCoreObjectDataToFactories(
            Set<T> configuredObjects, CoreObjectMapper<T, U> mapper) throws ConfigurationException {

        logger.debug("Mapping CoreObjectData to factories. Got " + configuredObjects.size() + " object(s) to map.");

        Map<CoreObjectFactory, Set<U>> coreObjectByFactory = new HashMap<>();

        for (T coreObject : configuredObjects) {

            Class<? extends CoreObjectFactory> factoryClass = findFactory(coreObject.factory);
            if (factoryClass == null) {
                throw new ConfigurationException("Cannot setup sensor with key '" + coreObject.id
                        + "' because there is no factory set up " + "with class '" + coreObject.factory
                        + "'");
            }

            CoreObjectFactory factory = configuredFactoriesByClass.get(factoryClass);
            assert factory != null : "We could find a factory with class " + factoryClass
                    + " so it must be contained in" + "the map of configured factories.";
            if (!coreObjectByFactory.containsKey(factory)) {
                coreObjectByFactory.put(factory, new HashSet<>());
            }
            logger.debug(coreObject + " belongs to " + factory);
            boolean notReplaced = coreObjectByFactory.get(factory).add(mapper.map(coreObject));
            assert notReplaced;

        }

        if (logger.isDebugEnabled()) {
            for (Entry<CoreObjectFactory, Set<U>> entry : coreObjectByFactory.entrySet()) {
                StringBuilder builder = new StringBuilder();
                builder.append("Mapping of objects to factories:\n");
                builder.append("   " + entry.getKey() + ":\n");
                for (U s : entry.getValue()) {
                    builder.append("      " + s + "\n");
                }
                logger.debug(builder.toString());
            }
        }

        return coreObjectByFactory;

    }

    /**
     * Maps {@link SensorData}s to {@link SensorToConfigure}s with appropriate class checking.
     *
     * @param confSensor sensor to map
     * @return mapped sensor
     * @throws ConfigurationException error while mapping, especially class finding errors
     */
    @SuppressWarnings("unchecked")
    private SensorToConfigure mapSensor(SensorData confSensor) throws ConfigurationException {

        SensorToConfigure sensor = new SensorToConfigure();

        sensor.setKey(confSensor.id);
        sensor.setSensorOptions(confSensor.params);

        try {

            sensor.setDataTypeClass(Class.forName(confSensor.dataType));
            sensor.setWireClass(Class.forName(confSensor.wireType));

            if (confSensor.listType != null && !confSensor.listType.isEmpty()) {

                Class<?> possibleListClass = Class.forName(confSensor.listType);
                if (!List.class.isAssignableFrom(possibleListClass)) {
                    throw new ConfigurationException("Class " + possibleListClass + " does not implement interface "
                            + List.class);
                }
                sensor.setListTypeClass((Class<? extends List<?>>) possibleListClass);
            }

            Class<?> possibleSensorClass = Class.forName(confSensor.sensorClass);
            if (!Sensor.class.isAssignableFrom(possibleSensorClass)) {
                throw new ConfigurationException("Class " + possibleSensorClass + " does not implement interface "
                        + Sensor.class);
            }
            sensor.setSensorClass((Class<? extends Sensor<?>>) possibleSensorClass);


        } catch (LinkageError | ClassNotFoundException e) {
            throw new ConfigurationException(e);
        }

        return sensor;

    }

    /**
     * Maps {@link MemoryData}s to {@link WorkingMemoryToConfigure} s with appropriate class checking.
     *
     * @param confMemory memory to map
     * @return mapped memory
     * @throws ConfigurationException error while mapping, especially class finding errors
     */
    @SuppressWarnings("unchecked")
    private WorkingMemoryToConfigure mapWorkingMemory(MemoryData confMemory) throws ConfigurationException {

        WorkingMemoryToConfigure memory = new WorkingMemoryToConfigure();

        memory.setKey(confMemory.id);
        memory.setMemoryOptions(confMemory.params);

        try {

            Set<SlotToConfigure> slots = new HashSet<>();
//            for (ConfiguredMemorySlot confSlot : confMemory.getMemorySlots()) {
//                SlotToConfigure slot = new SlotToConfigure();
//                slot.setDataTypeClass(Class.forName(confSlot.getDataTypeClassName()));
//                Class<?> possibleSlotClass = Class.forName(confSlot.getSlotClassName());
//                if (!MemorySlot.class.isAssignableFrom(possibleSlotClass)) {
//                    throw new ConfigurationException("Class " + possibleSlotClass + " does not implement interface "
//                            + MemorySlot.class, this);
//                }
//                slot.setSlotClass((Class<? extends MemorySlot<?>>) possibleSlotClass);
//                slots.add(slot);
//            }
//            memory.setSlots(slots);

            Class<?> possibleMemoryClass = Class.forName(confMemory.clazz);
            if (!WorkingMemory.class.isAssignableFrom(possibleMemoryClass)) {
                throw new ConfigurationException("Class " + possibleMemoryClass + " does not implement interface "
                        + WorkingMemory.class);
            }
            memory.setMemoryClass((Class<? extends WorkingMemory>) possibleMemoryClass);

        } catch (ExceptionInInitializerError | ClassNotFoundException e) {
            throw new ConfigurationException(e);
        }

        return memory;

    }

    /**
     * Creates the collection of user configured factories.
     *
     * @param requestedFactories set of factory settings found in the configuration file.
     * @throws ConfigurationException error configuring a factory
     */
    private void createFactories(Collection<FactoryData> requestedFactories) throws ConfigurationException {

        logger.debug("Creating factories: " + requestedFactories);

        if (requestedFactories.size() < 1) {
            throw new ConfigurationException("No factories requested by the user. "
                    + "This does not make sense, because then " + "no sensor or actuator can be created.");
        }

        configuredFactoriesByClass.values().forEach((fac) -> {
            fac.cleanUp();
        });
        configuredFactoriesByClass = new HashMap<>();
        requestedFactories.forEach(this::createFactory);

    }

    public void cleanUp() {
        configuredFactoriesByClass.values().forEach((fac) -> {
            fac.cleanUp();
        });
        configuredFactoriesByClass = new HashMap<>();
    }

    /**
     * Instantiates a configured factory and adds it to {@link #configuredFactoriesByClass}.
     *
     * @param requestedFactory factory to configure
     * @throws ConfigurationException error configuring the factory
     */
    private void createFactory(FactoryData requestedFactory) throws ConfigurationException {
        try {

            // first check that a class with the desired name exists and can be
            // instantiated
            Class<?> rawFactoryClass = Class.forName(requestedFactory.type);
            Object rawInstance = rawFactoryClass.newInstance();
            if (!(rawInstance instanceof CoreObjectFactory)) {
                throw new ConfigurationException("Class '" + requestedFactory.type
                        + "' is not an instance of " + CoreObjectFactory.class.getSimpleName());
            }
            CoreObjectFactory newFactory = (CoreObjectFactory) rawInstance;

            Class<? extends CoreObjectFactory> factoryClass = newFactory.getClass();

            // configure the new factory
            try {
                newFactory.initialize(requestedFactory.params);
            } catch (IllegalArgumentException e) {
                throw new ConfigurationException("Error configuring factory of class " + factoryClass.getSimpleName()
                        + " with the user supplied options: " + requestedFactory.params, e);
            } catch (InitializationException e) {
                throw new ConfigurationException("Error initializing factory of class " + factoryClass.getSimpleName()
                        + ".\nReason: " + e.getMessage(), e);
            }

            // add it to the list of configured factories
            configuredFactoriesByClass.put(factoryClass, newFactory);
            //logger.fatal("have " + configuredFactoriesByClass.size() + " factories");
            logger.debug("configured: " + requestedFactory.type);
        } catch (ClassNotFoundException e) {
            logger.debug(e.getClass().getSimpleName(), e);
            throw new ConfigurationException("Could not find a class with name '"
                    + requestedFactory.type + "'", e);
        } catch (LinkageError e) {
            logger.fatal("during " + requestedFactory.type);
            logger.debug(e.getClass().getSimpleName(), e);
            throw new ConfigurationException(e);
        } catch (InstantiationException e) {
            logger.debug(e.getClass().getSimpleName(), e);
            throw new ConfigurationException("Error creating a new instance of class '"
                    + requestedFactory.type + "'. Is it a top level member?", e);
        } catch (IllegalAccessException e) {
            logger.debug(e.getClass().getSimpleName(), e);
            throw new ConfigurationException("Error creating a new instance of class '"
                    + requestedFactory.type + "'. Does it have a default constructor?", e);
        } catch (SecurityException e) {
            logger.debug(e.getClass().getSimpleName(), e);
            throw new ConfigurationException("Error creating a new instance of class '"
                    + requestedFactory.type + "'", e);
        }

    }
}
