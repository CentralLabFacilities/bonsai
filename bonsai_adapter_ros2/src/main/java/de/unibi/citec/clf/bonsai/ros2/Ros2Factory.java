package de.unibi.citec.clf.bonsai.ros2;

import de.unibi.citec.clf.bonsai.core.CoreObjectFactory;
import de.unibi.citec.clf.bonsai.core.configuration.FactoryConfigurationResults;
import de.unibi.citec.clf.bonsai.core.configuration.ObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.exception.InitializationException;
import de.unibi.citec.clf.bonsai.core.object.*;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.bonsai.util.MapReader;
import de.unibi.citec.clf.bonsai.util.reflection.ReflectionServiceDiscovery;
import de.unibi.citec.clf.bonsai.util.reflection.ServiceDiscovery;
import de.unibi.citec.clf.btl.ros2.MsgTypeFactory;
import id.jros2client.JRos2Client;
import id.jros2client.JRos2ClientConfiguration;
import id.jros2client.JRos2ClientFactory;
import id.jrosmessages.Message;
import org.apache.log4j.Logger;
import pinorobotics.rtpstalk.RtpsTalkConfiguration;

import java.io.IOException;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.*;
import java.util.concurrent.*;

/**
 * @author lruegeme
 */
public class Ros2Factory implements CoreObjectFactory {

    static final String SERVICE_PKG_SENSOR = "de.unibi.citec.clf.bonsai.ros2.sensors";
    static final String SERVICE_PKG_ACTUATOR = "de.unibi.citec.clf.bonsai.ros2.actuators";
    //
    private static final String KEY_NODE_INIT_TIMEOUT = "NODE_INIT_TIMEOUT";
    private static final String KEY_INIT_SLEEP_TIME = "INIT_SLEEP_TIME";
    protected ServiceDiscovery serviceDiscoverySensor = new ReflectionServiceDiscovery(SERVICE_PKG_SENSOR);
    protected ServiceDiscovery serviceDiscoveryActuator = new ReflectionServiceDiscovery(SERVICE_PKG_ACTUATOR);
    protected Set<Class<? extends Ros2Node>> knownActuators = new HashSet<>();
    protected Set<Class<? extends Ros2Sensor>> knownSensors = new HashSet<>();
    protected Map<String, Boolean> isActuatorInitialized = new ConcurrentHashMap<>();
    protected Map<String, Actuator> initializedActuatorsByKey = new ConcurrentHashMap<>();
    protected Map<String, Boolean> isSensorInitialized = new ConcurrentHashMap<>();
    protected Map<String, Sensor> initializedSensorsByKey = new ConcurrentHashMap<>();
    protected Map<String, ConfiguredObject> configuredObjectsByKey = new ConcurrentHashMap<>();
    private Logger logger = Logger.getLogger(getClass());
    private CoordinateTransformer coordinateTransformer;
    private long nodeInitTimeout = 5000;
    private long sleepTime = 1000;

    private JRos2ClientFactory factory;

    /**
     * Constructor.
     */
    public Ros2Factory() {
        factory = new JRos2ClientFactory();
    }

    /**
     * @param node node to execute
     * @param wait wait for isInitialised
     */
    public void spawnRosNode(Ros2Node node, boolean wait) throws TimeoutException, ExecutionException, InterruptedException {
        // todo threads
        node.onStart();
        //wait for node to be initialized
        if (wait && !node.isInitialised().get(nodeInitTimeout, TimeUnit.MILLISECONDS)) {
            throw new ExecutionException(new TimeoutException("could not start node in " + nodeInitTimeout));
        }

    }

    /**
     * {@inheritDoc}
     */
    @Override
    public boolean canCreateActuator(String key, Class<? extends Actuator> actuatorClass) {
        return configuredObjectsByKey.containsKey(key);
        //ConfiguredObject obj = configuredObjectsByKey.get(key);
        //return actuatorClass.isAssignableFrom(obj.clazz);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public boolean canCreateSensor(String key, Class<?> dataType) {

        return configuredObjectsByKey.containsKey(key);
        //ConfiguredObject obj = configuredObjectsByKey.get(key);
        //return actuatorClass.isAssignableFrom(obj.clazz);

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
     *
     * @return
     */
    @Override
    public FactoryConfigurationResults configureActuators(Set<ActuatorToConfigure> actuators)
            throws IllegalArgumentException, CoreObjectCreationException {

        logger.info("Configuring actuators: " + actuators);
        FactoryConfigurationResults results = new FactoryConfigurationResults();

        actuatorLoop:
        for (ActuatorToConfigure actuator : actuators) {
            logger.debug("Processing actuator to configure: " + actuator);

            // find the actuator configuration that can handle this requested
            for (Class<? extends Ros2Node> actuatorClass : knownActuators) {

                logger.debug("Checking if class " + actuatorClass + " satifies actuator " + actuator);

                boolean isSuitable = actuatorClass.equals(actuator.getActuatorClass())
                        && actuator.getInterfaceClass().isAssignableFrom(actuatorClass);

                if (!isSuitable) {
                    logger.debug("Actuator class " + actuatorClass + " does not satify actuator " + actuator);
                    logger.trace("actuator class: " + actuatorClass);
                    logger.trace("actuator needs: " + actuator.getActuatorClass());
                    logger.trace("actuator class == " + (actuatorClass.equals(actuator.getActuatorClass())));
                    logger.trace("actuator impl " + actuator.getInterfaceClass().isAssignableFrom(actuatorClass));
                    continue;
                }
                logger.debug("Actuator class " + actuatorClass + " satisfies actuator " + actuator);

                ConfiguredActuator configured = new ConfiguredActuator();
                configured.clazz = actuatorClass;
                configured.conf = ObjectConfigurator.createConfigPhase();
                configured.implemented = actuator.getInterfaceClass();

                try {
                    // if this object is suitable, create an instance and configure it
                    Constructor<?> cons = actuatorClass.getConstructor(JRos2Client.class);
                    JRos2ClientConfiguration clientconfig = Ros2Node.getClientConfig();
                    try {
                        clientconfig = (JRos2ClientConfiguration) actuatorClass.getMethod("getClientConfig").invoke(null);
                    } catch (Exception e ) {
                        logger.debug("no custom client config found");
                    }
                    ManagedCoreObject object = (ManagedCoreObject) cons.newInstance(factory.createClient(clientconfig));
                    object.configure(configured.conf);
                    configured.conf.activateObjectPhase(actuator.getActuatorOptions());

                    configuredObjectsByKey.put(actuator.getKey(), configured);
                    isActuatorInitialized.put(actuator.getKey(), false);

                    // stop searching for this actuator
                    continue actuatorLoop;

                } catch (ConfigurationException e) {
                    logger.debug("error configuring Object:" + actuator.getKey() + " number errors:" + configured.conf.getExceptions().size());
                    results.exceptions.add(e);
                    for (ConfigurationException ex : configured.conf.getExceptions()) {
                        results.exceptions.add(ex);
                        logger.trace(ex.getMessage());
                    }

                    for (Map.Entry<String, Class> entry : configured.conf.getUnusedOptionalParams().entrySet()) {
                        logger.debug("unused opt param: " + entry.getKey());
                    }
                    continue actuatorLoop;
                } catch (IllegalAccessException | InstantiationException | NoSuchMethodException | SecurityException | InvocationTargetException ex) {
                    throw new CoreObjectCreationException(ex);
                }

            }

            logger.error("Error while configuring " + actuator.getKey()
                    + "! Implementation for Actuator "
                    + actuator.getActuatorClass() + " is unknown. ");

        }

        return results;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public FactoryConfigurationResults configureWorkingMemories(Set<WorkingMemoryToConfigure> memories)
            throws IllegalArgumentException, CoreObjectCreationException {
        logger.info("Configuring memories: " + memories);
        FactoryConfigurationResults results = new FactoryConfigurationResults();
        throw new CoreObjectCreationException("no ros memory");
    }

    /**
     * {@inheritDoc}
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    @Override
    public FactoryConfigurationResults configureSensors(Set<SensorToConfigure> sensors)
            throws IllegalArgumentException, CoreObjectCreationException {

        logger.info("Configuring sensors: " + sensors);
        FactoryConfigurationResults results = new FactoryConfigurationResults();

        List<Exception> exceptions = new LinkedList<>();

        sensorLoop:
        for (SensorToConfigure sensor : sensors) {
            logger.debug("Processing sensor to configure: " + sensor);

            if (sensor.isListSensor()) {
                //todo
                results.exceptions.add(new CoreObjectCreationException("no ros list sensors"));
                continue;
            }

            // find the sensor configuration that can handle this requested
            for (Class<? extends Ros2Sensor> sensorClass : knownSensors) {

                logger.debug("Checking if class " + sensorClass + " satifies sensor " + sensor);

                boolean isSuitable = sensorClass.equals(sensor.getSensorClass())
                        && Message.class.isAssignableFrom(sensor.getWireClass());

                if (!isSuitable) {
                    logger.debug("Sensor class " + sensorClass + " does not satify sensor " + sensor);
                    logger.trace("Sensor class: " + sensorClass);
                    logger.trace("Sensor needs: " + sensor.getSensorClass());
                    logger.trace("Sensor class == " + sensorClass.equals(sensor.getSensorClass()));
                    logger.trace("Sensor wire " + Message.class.isAssignableFrom(sensor.getWireClass()));
                    continue;
                }
                logger.debug("Sensor class " + sensorClass + " satisfies sensor " + sensor);

                ConfiguredSensor configured = new ConfiguredSensor();
                configured.clazz = sensorClass;
                configured.conf = ObjectConfigurator.createConfigPhase();
                configured.wire = sensor.getWireClass();
                configured.data = sensor.getDataTypeClass();
                configured.list = sensor.getListTypeClass();

                try {
                    // if this object is suitable, create an instance and configure it
                    Constructor<?>[] declaredConstructors = sensorClass.getDeclaredConstructors();
                    if (declaredConstructors.length != 1) {
                        throw new NoSuchMethodException("sensor wrong constructors?");
                    }
                    JRos2ClientConfiguration clientconfig = Ros2Node.getClientConfig();
                    try {
                        clientconfig = (JRos2ClientConfiguration) sensorClass.getMethod("getClientConfig").invoke(null);
                    } catch (Exception e ) {
                        logger.debug("no custom client config found");
                    }
                    ManagedCoreObject object = (ManagedCoreObject) declaredConstructors[0].newInstance(
                            configured.data, configured.wire, factory.createClient(clientconfig));
                    object.configure(configured.conf);
                    configured.conf.activateObjectPhase(sensor.getSensorOptions());

                    configuredObjectsByKey.put(sensor.getKey(), configured);
                    isSensorInitialized.put(sensor.getKey(), false);

                    // stop searching for this actuator
                    continue sensorLoop;

                } catch (ConfigurationException e) {
                    logger.debug("error configuring Object:" + sensor.getKey() + " number errors:" + configured.conf.getExceptions().size());
                    results.exceptions.add(e);
                    for (ConfigurationException ex : configured.conf.getExceptions()) {
                        results.exceptions.add(ex);
                        logger.trace(ex.getMessage());
                    }

                    for (Map.Entry<String, Class> entry : configured.conf.getUnusedOptionalParams().entrySet()) {
                        logger.trace("unused opt param: " + entry.getKey());
                    }
                    continue sensorLoop;
                } catch (IllegalAccessException | InstantiationException | NoSuchMethodException | SecurityException | InvocationTargetException ex) {
                    logger.error(ex);
                    continue sensorLoop;
                }

            }

            logger.error("Error while configuring " + sensor.getKey()
                    + "! Implementation for Sensor "
                    + sensor.getSensorClass() + " is unknown. ");

        }
        return results;
    }

    @Override
    public FactoryConfigurationResults configureCoordinateTransformer(CoordinateTransformerToConfigure transformer) throws IllegalArgumentException, CoreObjectCreationException {

        logger.info("Configuring transformer: " + transformer);
        FactoryConfigurationResults results = new FactoryConfigurationResults();

        if (transformer.getTransformerClass().equals(Tf2Transformer.class)) {
            coordinateTransformer = new Tf2Transformer(factory.createClient());
        }else {
            throw new IllegalArgumentException("can only create " + Tf2Transformer.class +
                    " but requested is: " + transformer.getTransformerClass());
        }

        return results;
    }

    public <T extends Actuator> T createActuator(String key, Class<T> actuatorClass, boolean wait)
            throws IllegalArgumentException, CoreObjectCreationException {
        logger.trace("create actuator: " + actuatorClass);

        if (isActuatorInitialized.get(key)) {
            //check if actuator is still connected
            if (((Ros2Node) initializedActuatorsByKey.get(key)).connectionsAlive() ) {
                return (T) initializedActuatorsByKey.get(key);
            } else {
                // lost connection, shutdown
                logger.error("Actuator: " + key + " class: " + actuatorClass + ", seems to has lost its connections, shutdown and restart");
                isActuatorInitialized.put(key,false);
                try {
                    ((Ros2Node) initializedActuatorsByKey.get(key)).cleanUp();
                } catch (IOException e) {
                    logger.error(e);
                }
                initializedActuatorsByKey.remove(key);
            }
        } else {
            logger.warn("create actuator: " + key + " class: " + actuatorClass + ", have no initialized actuator of this type");
        }

        // first check that the requested actuator can be created
        if (!canCreateActuator(key, actuatorClass)) {
            throw new IllegalArgumentException("No actuator with key '" + key
                    + "' and interface class '" + actuatorClass
                    + "' can be created by this factory.");
        }



        ConfiguredObject obj = configuredObjectsByKey.get(key);
        Actuator actuator;

        try {
            JRos2ClientConfiguration clientconfig = Ros2Node.getClientConfig();
            try {
                clientconfig = (JRos2ClientConfiguration) actuatorClass.getMethod("getClientConfig").invoke(null);
            } catch (Exception e ) {
                logger.debug("no custom client config found");
            }
            Constructor<?> cons = obj.clazz.getConstructor(JRos2Client.class);
            actuator = (Actuator) cons.newInstance(factory.createClient(clientconfig));
            ((Ros2Node) actuator).setKey(key);
            actuator.configure(obj.conf);
        } catch (NoSuchMethodException | SecurityException | InstantiationException | IllegalAccessException | InvocationTargetException ex) {
            logger.error("failed to create instance");
            throw new CoreObjectCreationException(ex);
        } catch (ConfigurationException e) {
            throw new CoreObjectCreationException(e);
        }

        if (actuator instanceof Ros2Node) {
            try {
                spawnRosNode((Ros2Node) actuator, wait);
                if (wait) {
                   TimeUnit.MILLISECONDS.sleep(sleepTime);
                }
            } catch (InterruptedException | ExecutionException | TimeoutException ex) {
                logger.error(ex);
                throw new CoreObjectCreationException("cant execute node for: " + actuator.getClass());
            }
        } else {
            logger.fatal("critical fail");
            throw new CoreObjectCreationException("cant execute node for: " + actuator.getClass());
        }

        if (wait) {
            isActuatorInitialized.put(key, true);
            initializedActuatorsByKey.put(key, actuator);
        }

        try {
            return (T) actuator;
        } catch (ClassCastException e) {
            assert false : "canCreateActuator seems to be wrong...";

            throw new IllegalArgumentException("No actuator with key '" + key
                    + "' and interface class '" + actuatorClass
                    + "' can be created by this factory.");
        }

    }

    /**
     * {@inheritDoc}
     */
    @SuppressWarnings("unchecked")
    @Override
    public <T extends Actuator> T createActuator(String key, Class<T> actuatorClass)
            throws IllegalArgumentException, CoreObjectCreationException {
        return this.createActuator(key, actuatorClass, true);
    }

    public <T> Sensor<T> createSensor(String key, Class<T> dataType, boolean wait)
            throws IllegalArgumentException, CoreObjectCreationException {

        logger.trace("create sensor for: " + dataType);
        //check if actuator was already initialized
        if (isSensorInitialized.get(key)) {
            return (Sensor<T>) initializedSensorsByKey.get(key);
        }

        // first check that the requested actuator can be created
        if (!canCreateSensor(key, dataType)) {
            throw new IllegalArgumentException("No Sensor with key '" + key
                    + "' and data class '" + dataType
                    + "' can be created by this factory.");
        }

        ConfiguredSensor obj;
        Sensor sensor;

        try {
            obj = (ConfiguredSensor) configuredObjectsByKey.get(key);
            Constructor<?>[] declaredConstructors = obj.clazz.getDeclaredConstructors();
            if (declaredConstructors.length != 1) {
                throw new NoSuchMethodException("sensor wrong constructors?");
            }
            JRos2ClientConfiguration clientconfig = Ros2Node.getClientConfig();
            try {
                clientconfig = (JRos2ClientConfiguration) obj.clazz.getMethod("getClientConfig").invoke(null);
            } catch (Exception e ) {
                logger.debug("no custom client config found");
            }

            sensor = (Sensor) declaredConstructors[0].newInstance(obj.data, obj.wire, factory.createClient(clientconfig));
            ((Ros2Node) sensor).setKey(key);
            sensor.configure(obj.conf);
        } catch (NoSuchMethodException | SecurityException | InstantiationException | IllegalAccessException | InvocationTargetException ex) {
            logger.error("failed to create instance");
            throw new CoreObjectCreationException(ex);
        } catch (ConfigurationException ex) {
            throw new CoreObjectCreationException(ex);
        } catch (ClassCastException ex) {
            assert false : "canCreateActuator seems to be wrong...";
            throw new CoreObjectCreationException(ex);
        }

        if (sensor instanceof Ros2Node) {
            try {
                spawnRosNode((Ros2Node) sensor, wait);
                if (wait) {
                    TimeUnit.MILLISECONDS.sleep(sleepTime);
                }
            } catch (InterruptedException | ExecutionException | TimeoutException ex) {
                logger.error(ex);
                throw new CoreObjectCreationException("cant execute node for: " + sensor.getClass());
            }
        } else {
            logger.fatal("critical fail");
            throw new CoreObjectCreationException("cant execute node for: " + sensor.getClass());
        }

        if (wait) {
            isSensorInitialized.put(key, true);
            initializedSensorsByKey.put(key, sensor);
        }


        try {
            return (Sensor<T>) sensor;
        } catch (ClassCastException e) {
            assert false : "canCreateActuator seems to be wrong...";

            throw new IllegalArgumentException("No Sensor with key '" + key
                    + "' and data class '" + dataType
                    + "' can be created by this factory.");
        }

    }

    /**
     * {@inheritDoc}
     */
    @SuppressWarnings("unchecked")
    @Override
    public <T> Sensor<T> createSensor(String key, Class<T> dataType)
            throws IllegalArgumentException, CoreObjectCreationException {
        return this.createSensor(key, dataType, true);
    }

    /**
     * {@inheritDoc}
     */
    @SuppressWarnings("unchecked")
    @Override
    public <S extends List<T>, T> Sensor<S> createSensor(String key,
                                                         Class<S> listType, Class<T> dataType)
            throws IllegalArgumentException, CoreObjectCreationException {

        throw new CoreObjectCreationException("ros has no list sensor atm");
    }

    /**
     * {@inheritDoc}
     */
    @Override
    @SuppressWarnings({"rawtypes", "unchecked"})
    public void initialize(Map<String, String> options)
            throws IllegalArgumentException, InitializationException {

        try {
            nodeInitTimeout = MapReader.readConfigLong(KEY_NODE_INIT_TIMEOUT, nodeInitTimeout, options);
            sleepTime = MapReader.readConfigLong(KEY_INIT_SLEEP_TIME, sleepTime, options);
        } catch (MapReader.KeyNotFound keyNotFound) {
            throw new IllegalArgumentException(keyNotFound);
        }
        logger.info("set node init timeout to " + nodeInitTimeout);
        logger.info("set init sleep time to " + sleepTime);


        knownActuators = serviceDiscoveryActuator.discoverServicesByInterface(Ros2Node.class);
        knownSensors = serviceDiscoverySensor.discoverServicesByInterface(Ros2Sensor.class);
        this.cleanUp();

    }

    @SuppressWarnings("unchecked")
    @Override
    public <T extends WorkingMemory> T createWorkingMemory(String key) throws IllegalArgumentException,
            CoreObjectCreationException {
        throw new CoreObjectCreationException("no ros memories");
    }

    @Override
    public boolean canCreateWorkingMemory(String key) {
        return false;
    }

    @SuppressWarnings("unchecked")
    @Override
    public <T extends TransformLookup> T createCoordinateTransformer() throws IllegalArgumentException,
            CoreObjectCreationException {

        if (coordinateTransformer == null)
            throw new CoreObjectCreationException("no ros transformer configured");

        if(coordinateTransformer instanceof Tf2Transformer) {
            Tf2Transformer c = (Tf2Transformer) coordinateTransformer;
            if (!c.getNode().initialized) {
                try {
                    spawnRosNode(c.getNode(), true);
                } catch (TimeoutException | ExecutionException | InterruptedException e) {
                    throw new CoreObjectCreationException(e);
                }
            }
        } else {
            logger.error("Transformer init error");
//            Tf2Transformer c = (Tf2Transformer) coordinateTransformer;
//            if (!c.getNode().initialized) {
//                try {
//                    spawnRosNode(c.getNode(), true);
//                } catch (TimeoutException | ExecutionException | InterruptedException e) {
//                    throw new CoreObjectCreationException(e);
//                }
//            }
        }



        return (T) coordinateTransformer;

    }

    @Override
    public boolean canCreateCoordinateTransformer() {
        return true;
    }

    @Override
    public void cleanUp() {
        logger.warn("cleanup, may take some time...");
        initializedActuatorsByKey.values().stream().filter((a) -> (a instanceof Ros2Node)).forEachOrdered((a) -> {
            try {
                ((Ros2Node) a).cleanUp();
            } catch (IOException e) {
                logger.error(e);
            }
        });

        initializedSensorsByKey.values().stream().filter((s) -> (s instanceof Ros2Node)).forEachOrdered((s) -> {
            try {
                ((Ros2Node) s).cleanUp();
            } catch (IOException e) {
                logger.error(e);
            }
        });

        if (coordinateTransformer != null) {
            if(coordinateTransformer instanceof Tf2Transformer) {
                Tf2Transformer c = (Tf2Transformer) coordinateTransformer;
                try {
                    c.getNode().cleanUp();
                } catch (IOException e) {
                    logger.error(e);
                }
            } else {
                //
            }

        }

    }

    @Override
    public FactoryConfigurationResults createAndCacheAllConfiguredObjects() throws CoreObjectCreationException {

        FactoryConfigurationResults res = new FactoryConfigurationResults();
        Queue<Ros2Node> nodesQuene = new ConcurrentLinkedQueue<>();

        if (coordinateTransformer != null) {
            if(coordinateTransformer instanceof Tf2Transformer) {
                Tf2Transformer c = (Tf2Transformer) coordinateTransformer;
                try {
                    spawnRosNode(c.getNode(), false);
                } catch (TimeoutException | ExecutionException | InterruptedException e) {
                    logger.error(e);
                }
            } else {
               //
            }


        }

        configuredObjectsByKey.entrySet().parallelStream().forEach((entry) -> {
            String key = entry.getKey();
            ConfiguredObject obj = entry.getValue();

            Ros2Node node;

            try {
                if (obj instanceof ConfiguredActuator) {
                    ConfiguredActuator act = (ConfiguredActuator) obj;
                    node = (Ros2Node) createActuator(key, act.clazz, false);
                } else if (obj instanceof ConfiguredSensor) {
                    ConfiguredSensor sen = (ConfiguredSensor) obj;
                    node = (Ros2Node) createSensor(key, sen.clazz, false);
                } else {
                    throw new CoreObjectCreationException("?");
                }

                nodesQuene.add(node);

            } catch (ClassCastException | IllegalArgumentException | CoreObjectCreationException ex) {
                logger.fatal("object " + key + " with class " + obj.clazz + " cached creation error");
            }
        });

        logger.debug("Waiting for all nodes to connect in " + nodeInitTimeout + "ms");

        nodesQuene.parallelStream().forEach((node) -> {
            String key = node.getKey();
            try {
                if (!node.isInitialised().get(nodeInitTimeout, TimeUnit.MILLISECONDS)) {
                    logger.warn("node is not started " + key + " " + node.initialized);
                    res.exceptions.add(new CoreObjectCreationException("node is not started " + key));
                } else {
                    if (node instanceof Sensor) {
                        isSensorInitialized.put(key, true);
                        initializedSensorsByKey.put(key, (Sensor) node);
                    } else if (node instanceof Actuator) {
                        isActuatorInitialized.put(key, true);
                        initializedActuatorsByKey.put(key, (Actuator) node);
                    }
                }
            } catch (InterruptedException | ExecutionException ex) {
                logger.warn(ex);
                res.exceptions.add(ex);
            } catch (TimeoutException ex) {
                res.exceptions.add(new CoreObjectCreationException("node is not started: " + node.getKey() + " " + node.initialized + " check stderr for output"));
            }
        });

        logger.debug("Sleep additional " + sleepTime);
        try {
            TimeUnit.MILLISECONDS.sleep(sleepTime);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }

        logger.debug("all nodes should be started now");
        return res;
    }

    private class ConfiguredObject {

        public Class clazz;
        public ObjectConfigurator conf;
    }

    private class ConfiguredActuator extends ConfiguredObject {

        public Class implemented = null;
    }

    private class ConfiguredSensor extends ConfiguredObject {

        public Class wire;
        public Class data;
        public Class list;
    }

}
