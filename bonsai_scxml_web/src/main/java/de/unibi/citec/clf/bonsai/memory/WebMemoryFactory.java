package de.unibi.citec.clf.bonsai.memory;

import de.unibi.citec.clf.bonsai.core.CoreObjectFactory;
import de.unibi.citec.clf.bonsai.core.configuration.FactoryConfigurationResults;
import de.unibi.citec.clf.bonsai.core.configuration.ObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.exception.InitializationException;
import de.unibi.citec.clf.bonsai.core.object.*;
import org.apache.log4j.Logger;

import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Factory for web-enabled Bonsai working memories. */
public class WebMemoryFactory implements CoreObjectFactory {

    private static final Logger LOG = Logger.getLogger(WebMemoryFactory.class);

    private final Map<String, ConfiguredMemory> configuredMemories = new LinkedHashMap<>();
    private final Map<String, WebSupportMemory> initializedMemories = new LinkedHashMap<>();

    private static final class ConfiguredMemory {
        final WebSupportMemory memory;
        final ObjectConfigurator configuration;

        ConfiguredMemory(WebSupportMemory memory, ObjectConfigurator configuration) {
            this.memory = memory;
            this.configuration = configuration;
        }
    }

    @Override
    public void initialize(Map<String, String> options) throws InitializationException {
        // nothing to initialize
    }

    @Override
    public synchronized FactoryConfigurationResults configureWorkingMemories(
            Set<WorkingMemoryToConfigure> memories) throws CoreObjectCreationException {
        FactoryConfigurationResults results = new FactoryConfigurationResults();

        for (WorkingMemoryToConfigure requested : memories) {
            String key = requested.getKey();
            if (configuredMemories.containsKey(key)) {
                LOG.debug("Web memory '" + key + "' already configured");
                continue;
            }

            if (requested.getMemoryClass() != WebSupportMemory.class) {
                results.exceptions.add(new CoreObjectCreationException(
                        "WebMemoryFactory cannot configure memory '" + key + "' of type "
                                + requested.getMemoryClass()));
                continue;
            }

            WebSupportMemory memory = new WebSupportMemory();
            ObjectConfigurator conf = ObjectConfigurator.createConfigPhase();
            try {
                memory.configure(conf);
                Map<String, String> options = requested.getMemoryOptions();
                conf.activateObjectPhase(options == null ? Collections.emptyMap() : options);
                configuredMemories.put(key, new ConfiguredMemory(memory, conf));
            } catch (ConfigurationException failure) {
                results.exceptions.add(failure);
                LOG.warn("Could not configure web memory '" + key + "'", failure);
            }
        }

        return results;
    }

    @Override
    @SuppressWarnings("unchecked")
    public synchronized <T extends WorkingMemory> T createWorkingMemory(String key)
            throws IllegalArgumentException, CoreObjectCreationException {
        WebSupportMemory ready = initializedMemories.get(key);
        if (ready != null) return (T) ready;

        ConfiguredMemory configured = configuredMemories.get(key);
        if (configured == null) {
            throw new IllegalArgumentException("No web memory configured with key '" + key + "'");
        }

        try {
            configured.memory.configure(configured.configuration);
        } catch (ConfigurationException failure) {
            throw new CoreObjectCreationException("Could not initialize web memory '" + key + "'", failure);
        }

        initializedMemories.put(key, configured.memory);
        LOG.info("Web memory '" + key + "' initialized: "
                + System.identityHashCode(configured.memory));
        return (T) configured.memory;
    }

    @Override
    public synchronized boolean canCreateWorkingMemory(String key) {
        return configuredMemories.containsKey(key);
    }

    @Override
    public synchronized FactoryConfigurationResults createAndCacheAllConfiguredObjects()
            throws CoreObjectCreationException {
        FactoryConfigurationResults results = new FactoryConfigurationResults();
        for (String key : configuredMemories.keySet()) {
            try {
                createWorkingMemory(key);
            } catch (CoreObjectCreationException | IllegalArgumentException failure) {
                results.exceptions.add(failure);
            }
        }
        return results;
    }

    @Override
    public synchronized void cleanUp() {
        // Configured-but-not-started instances are included too. Avoid double cleanup.
        for (ConfiguredMemory configured : configuredMemories.values()) {
            try {
                configured.memory.cleanUp();
            } catch (IOException failure) {
                LOG.warn("Could not clean up web memory", failure);
            }
        }
        initializedMemories.clear();
        configuredMemories.clear();
    }

    // WebMemoryFactory only supports working memories.
    @Override
    public boolean canCreateActuator(String key, Class<? extends Actuator> actuatorClass) { return false; }

    @Override
    public boolean canCreateSensor(String key, Class<?> dataType) { return false; }

    @Override
    public boolean canCreateSensor(String key, Class<? extends List<?>> listType, Class<?> dataType) { return false; }

    @Override
    public <T extends Actuator> T createActuator(String key, Class<T> actuatorClass) { return null; }

    @Override
    public <T> Sensor<T> createSensor(String key, Class<T> dataType) { return null; }

    @Override
    public <S extends List<T>, T> Sensor<S> createSensor(String key, Class<S> listType, Class<T> dataType) { return null; }

    @Override
    public <T extends TransformLookup> T createCoordinateTransformer() { return null; }

    @Override
    public boolean canCreateCoordinateTransformer() { return false; }

    @Override
    public FactoryConfigurationResults configureSensors(Set<SensorToConfigure> sensors) {
        return new FactoryConfigurationResults();
    }

    @Override
    public FactoryConfigurationResults configureActuators(Set<ActuatorToConfigure> actuators) {
        return new FactoryConfigurationResults();
    }

    @Override
    public FactoryConfigurationResults configureCoordinateTransformer(CoordinateTransformerToConfigure transformer) {
        return new FactoryConfigurationResults();
    }
}
