package de.unibi.citec.clf.bonsai.memory;


import de.unibi.citec.clf.bonsai.core.CoreObjectFactory;
import de.unibi.citec.clf.bonsai.core.configuration.FactoryConfigurationResults;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.exception.InitializationException;
import de.unibi.citec.clf.bonsai.core.object.*;
import org.apache.log4j.Logger;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Factory for Bonsai core memory
 *
 * @author lruegeme
 */
public class MemoryFactory implements CoreObjectFactory {

    private Logger logger = Logger.getLogger(getClass());

    WorkingMemory memory = null;


    /**
     * {@inheritDoc}
     */
    @Override
    public boolean canCreateActuator(String key, Class<? extends Actuator> actuatorClass) {
        return false;
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
        return null;
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
    public void initialize(Map<String, String> options) throws IllegalArgumentException, InitializationException {
        //no params
    }

    @SuppressWarnings("unchecked")
    @Override
    public <T extends WorkingMemory> T createWorkingMemory(String key)
            throws IllegalArgumentException, CoreObjectCreationException {

        if (memory == null) {
            logger.debug("create new Memory");
            memory = new DefaultMemory();
        }
        return (T) memory;
    }

    @Override
    public boolean canCreateWorkingMemory(String key) {
        return true;
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
        //not needed
    }

    @Override
    public FactoryConfigurationResults configureSensors(Set<SensorToConfigure> sensors) throws IllegalArgumentException, CoreObjectCreationException {
        return new FactoryConfigurationResults();
    }

    @Override
    public FactoryConfigurationResults configureActuators(Set<ActuatorToConfigure> actuators) throws IllegalArgumentException, CoreObjectCreationException {
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
