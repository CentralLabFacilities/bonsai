package de.unibi.citec.clf.bonsai.test;


import de.unibi.citec.clf.bonsai.core.CoreObjectFactory;
import de.unibi.citec.clf.bonsai.core.configuration.FactoryConfigurationResults;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.exception.InitializationException;
import de.unibi.citec.clf.bonsai.core.object.*;
import de.unibi.citec.clf.bonsai.util.reflection.ReflectionServiceDiscovery;
import de.unibi.citec.clf.bonsai.util.reflection.ServiceDiscovery;
import org.apache.log4j.Logger;

import java.lang.reflect.InvocationTargetException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Factory for Bonsai core memory
 *
 * @author lruegeme
 */
public class TestFactory implements CoreObjectFactory {

    private Logger logger = Logger.getLogger(getClass());

    static final String SERVICE_PKG_SENSOR = "de.unibi.citec.clf.bonsai.test.sensors";
    static final String SERVICE_PKG_ACTUATOR = "de.unibi.citec.clf.bonsai.test.actuators";
    protected ServiceDiscovery serviceDiscoverySensor = new ReflectionServiceDiscovery(SERVICE_PKG_SENSOR);
    protected ServiceDiscovery serviceDiscoveryActuator = new ReflectionServiceDiscovery(SERVICE_PKG_ACTUATOR);

    protected Set<Class<? extends Actuator>> knownActuators = new HashSet<>();
    protected Set<Class<? extends Sensor>> knownSensors = new HashSet<>();

    protected Map<String, Object> configuredObjectsByKey = new ConcurrentHashMap<>();

    /**
     * {@inheritDoc}
     */
    @Override
    public boolean canCreateActuator(String key, Class<? extends Actuator> actuatorClass) {
        return true;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public boolean canCreateSensor(String key, Class<?> dataType) {
        return false;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public boolean canCreateSensor(String key, Class<? extends List<?>> listType, Class<?> dataType) {
        return false;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public <T extends Actuator> T createActuator(String key, Class<T> actuatorClass)
            throws IllegalArgumentException, CoreObjectCreationException {
        return (T) configuredObjectsByKey.get(key);
    }

    /**
     * {@inheritDoc}
     */
    @SuppressWarnings("unchecked")
    @Override
    public <T> Sensor<T> createSensor(String key, Class<T> dataType)
            throws IllegalArgumentException, CoreObjectCreationException {
        return null;
    }

    /**
     * {@inheritDoc}
     */
    @SuppressWarnings("unchecked")
    @Override
    public <S extends List<T>, T> Sensor<S> createSensor(String key, Class<S> listType, Class<T> dataType)
            throws IllegalArgumentException, CoreObjectCreationException {
        return null;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    @SuppressWarnings({"rawtypes", "unchecked"})
    public void initialize(Map<String, String> options) throws IllegalArgumentException, InitializationException {

        knownActuators = serviceDiscoveryActuator.discoverServicesByInterface(Actuator.class);
        knownSensors = serviceDiscoverySensor.discoverServicesByInterface(Sensor.class);

        logger.debug("Test factory initialize");
        logger.debug("found " + knownActuators.size() + " actuators:");
        for (Class c : knownActuators) {
            logger.debug("found " + c);
        }
    }

    @SuppressWarnings("unchecked")
    @Override
    public <T extends WorkingMemory> T createWorkingMemory(String key)
            throws IllegalArgumentException, CoreObjectCreationException {

        return null;
    }

    @Override
    public boolean canCreateWorkingMemory(String key) {
        return false;
    }

    @SuppressWarnings("unchecked")
    @Override
    public <T extends TransformLookup> T createCoordinateTransformer() throws IllegalArgumentException,
            CoreObjectCreationException {
        return null;
    }

    @Override
    public boolean canCreateCoordinateTransformer() {
        return false;
    }

    @Override
    public void cleanUp() {
        //no cleanup
    }

    @Override
    public FactoryConfigurationResults configureSensors(Set<SensorToConfigure> sensors) throws IllegalArgumentException, CoreObjectCreationException {
        return new FactoryConfigurationResults();
    }

    @Override
    public FactoryConfigurationResults configureActuators(Set<ActuatorToConfigure> actuators) throws IllegalArgumentException, CoreObjectCreationException {
        for (ActuatorToConfigure act : actuators) {
            try {
                configuredObjectsByKey.put(act.getKey(), act.getActuatorClass().getDeclaredConstructor().newInstance());
            } catch (InstantiationException | IllegalAccessException | NoSuchMethodException | InvocationTargetException e) {
                logger.warn(e);
            }
        }


        return new FactoryConfigurationResults();
    }

    @Override
    public FactoryConfigurationResults configureWorkingMemories(Set<WorkingMemoryToConfigure> memories) throws IllegalArgumentException, CoreObjectCreationException {
        return new FactoryConfigurationResults();
    }

    @Override
    public FactoryConfigurationResults configureCoordinateTransformer(CoordinateTransformerToConfigure value) throws IllegalArgumentException, CoreObjectCreationException {
        return new FactoryConfigurationResults();
    }

    @Override
    public FactoryConfigurationResults createAndCacheAllConfiguredObjects() throws CoreObjectCreationException {
        return new FactoryConfigurationResults();
    }
}
