package de.unibi.citec.clf.bonsai.core;



import de.unibi.citec.clf.bonsai.core.object.WorkingMemory;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.bonsai.core.object.WorkingMemoryToConfigure;
import de.unibi.citec.clf.bonsai.core.object.SensorToConfigure;
import de.unibi.citec.clf.bonsai.core.object.CoordinateTransformerToConfigure;
import de.unibi.citec.clf.bonsai.core.object.ActuatorToConfigure;
import de.unibi.citec.clf.bonsai.core.configuration.FactoryConfigurationResults;
import de.unibi.citec.clf.bonsai.core.exception.InitializationException;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;

import java.util.List;
import java.util.Map;
import java.util.Set;

import de.unibi.citec.clf.bonsai.core.object.TransformLookup;

/**
 * Interface for factories used to created middleware-specific sensors or
 * actuators.
 * 
 * Every implementation of this interface must provide a default constructor.
 * 
 * @author jwienke
 */
public interface CoreObjectFactory {

    /**
     * Configures the factory with user-supplied options. This is the first
     * method invoked
     * 
     * @param options
     *            options provided by the user as key-value-pairs.
     * @throws IllegalArgumentException
     *             this exception may be thrown to indicate an error in the
     *             options provided by the user. If this is thrown, the factory
     *             may be in an undetermined state and should not be used for
     *             creating Bonsai objects
     * @throws InitializationException
     *             a general error initializing this factory occurred. It cannot
     *             be used after this exception
     */
    void initialize(Map<String, String> options) throws IllegalArgumentException, InitializationException;

    /**
     * Configure all sensors requested by the user and, if possible, already
     * connect them to reduce concrete sensor creation time.
     * 
     * @param sensors
     *            list of sensors
     * @throws IllegalArgumentException
     *             error in the configuration provided by the use
     * @throws CoreObjectCreationException
     *             error connecting one of the requested sensors
     */
    FactoryConfigurationResults configureSensors(Set<SensorToConfigure> sensors) throws IllegalArgumentException,
            CoreObjectCreationException;

    /**
     * Configure all actuators requested by the user and, if possible, already
     * connect them to reduce concrete sensor creation time.
     * 
     * @param actuators
     *            list of actuators
     * @throws IllegalArgumentException
     *             error in the configuration provided by the use
     * @throws CoreObjectCreationException
     *             error connecting one of the requested actuators
     */
    FactoryConfigurationResults configureActuators(Set<ActuatorToConfigure> actuators) throws IllegalArgumentException,
            CoreObjectCreationException;

    /**
     * Configure all working memories requested by the user and, if possible,
     * already connect them to reduce concrete memory creation time.
     * 
     * @param memories
     *            list of memories
     * @throws IllegalArgumentException
     *             error in the configuration provided by the use
     * @throws CoreObjectCreationException
     *             error connecting one of the requested memories
     */
    FactoryConfigurationResults configureWorkingMemories(Set<WorkingMemoryToConfigure> memories)
            throws IllegalArgumentException, CoreObjectCreationException;
    
    /**
     * Configure a coordinate transformer requested by the user.
     * 
     * @param value
     *            transformers
     * @throws IllegalArgumentException
     *             error in the configuration provided by the use
     * @throws CoreObjectCreationException
     *             error creating the transformer
     */
	FactoryConfigurationResults configureCoordinateTransformer(CoordinateTransformerToConfigure value)
			throws IllegalArgumentException, CoreObjectCreationException;

    /**
     * Factory method to create a new sensor for the given data type provided by
     * the resulting sensor.
     * 
     * @param <T>
     *            data type of the sensor to create
     * @param key
     *            key under which the sensor was registered at a call to
     *            {@link #configureSensors(Set)}
     * @param dataType
     *            class object representing the data type of the sensor to
     *            create
     * @return new instance of the sensor
     * @throws IllegalArgumentException
     *             there is no sensor for the given data type with the provided
     *             key
     * @throws CoreObjectCreationException
     *             error while creating the requested sensor
     */
    <T> Sensor<T> createSensor(String key, Class<T> dataType) throws IllegalArgumentException,
            CoreObjectCreationException;

    /**
     * Factory method to create a new sensor for the given list and data type
     * provided by the resulting sensor.
     * 
     * @param <S>
     *            list type of the sensor to create
     * @param <T>
     *            data type of the sensor to create
     * @param key
     *            key under which the sensor was registered at a call to
     *            {@link #configureSensors(Set)}
     * @param listType
     *            class object representing the list type of the sensor to
     *            create
     * @param dataType
     *            class object representing the data type of the sensor to
     *            create
     * @return new instance of the sensor
     * @throws IllegalArgumentException
     *             there is no sensor for the given data type with the provided
     *             key
     * @throws CoreObjectCreationException
     *             error while creating the requested sensor
     */
    <S extends List<T>, T> Sensor<S> createSensor(String key, Class<S> listType, Class<T> dataType)
            throws IllegalArgumentException, CoreObjectCreationException;

    /**
     * Tells if this factory can create a sensor of the given key with the data
     * type to return.
     * 
     * @param key
     *            key under which the sensor was registered at a call to
     *            {@link #configureSensors(Set)}
     * @param dataType
     *            class object representing the data type of the sensor to
     *            create
     * @return <code>true</code> if a sensor with this key and the specified
     *         return type can be created in a call to
     *         {@link #createSensor(String, Class)}, else <code>false</code>
     */
    boolean canCreateSensor(String key, Class<?> dataType);

    /**
     * Tells if this factory can create a sensor of the given key with the list
     * and data type to return.
     * 
     * @param key
     *            key under which the sensor was registered at a call to
     *            {@link #configureSensors(Set)}
     * @param listType
     *            class object representing the list type of the sensor to
     *            create
     * @param dataType
     *            class object representing the data type of the sensor to
     *            create
     * @return <code>true</code> if a sensor with this key and the specified
     *         return type can be created in a call to
     *         {@link #createSensor(String, Class)}, else <code>false</code>
     */
    boolean canCreateSensor(String key, Class<? extends List<?>> listType, Class<?> dataType);

    /**
     * Factory method to create a new actuator of the provided type.
     * 
     * @param <T>
     *            type of the actuator to create (minimally implemented
     *            interface)
     * @param key
     *            key under which the actuator was registered at a call to
     *            {@link #configureActuators(Set)}
     * @param actuatorClass
     *            class object representing the type of the actuator to create
     * @return new instance of the actuator
     * @throws IllegalArgumentException
     *             there is no actuator for the given type with the provided key
     * @throws CoreObjectCreationException
     *             error while creating the requested actuator
     */
    <T extends Actuator> T createActuator(String key, Class<T> actuatorClass) throws IllegalArgumentException,
            CoreObjectCreationException;

    /**
     * Tells if this factory can create an actuator with the provided key that
     * is assignable to an instance of the given interface class.
     * 
     * @param key
     *            key of the actuator
     * @param actuatorClass
     *            interface that the actuator to create must minimally fulfill
     * @return <code>true</code> if such an actuator can be created, else
     *         <code>false</code>
     */
    boolean canCreateActuator(String key, Class<? extends Actuator> actuatorClass);

    /**
     * Factory method to create a new working memory.
     * 
     * @param key
     *            key under which the actuator was registered at a call to
     *            {@link #configureWorkingMemories(Set)}
     * @return new instance of the working memory
     * @throws IllegalArgumentException
     *             there is no working memory for the given type with the
     *             provided key
     * @throws CoreObjectCreationException
     *             error while creating the requested working memory
     */
    <T extends WorkingMemory> T createWorkingMemory(String key) throws IllegalArgumentException,
            CoreObjectCreationException;

    /**
     * Tells if this factory can create a working memory with the provided key.
     * 
     * @param key
     *            key of the actuator
     * @return <code>true</code> if such a working memory can be created, else
     *         <code>false</code>
     */
    boolean canCreateWorkingMemory(String key);
    
    /**
     * Factory method to create a new coordinate transformer.
     * 
     * @return new instance of the coordinate transformer
     * @throws CoreObjectCreationException
     *             error while creating the requested coordinate transformer
     */
    <T extends TransformLookup> T createCoordinateTransformer() throws IllegalArgumentException,
            CoreObjectCreationException;

    /**
     * Tells if this factory can create a coordinate transformer.
     * 
     * @return <code>true</code> if such a coordinate transformer can be created, else
     *         <code>false</code>
     */
    boolean canCreateCoordinateTransformer();
    
    FactoryConfigurationResults createAndCacheAllConfiguredObjects() throws CoreObjectCreationException;

    /**
     * Clean up
     */
    void cleanUp();
}
