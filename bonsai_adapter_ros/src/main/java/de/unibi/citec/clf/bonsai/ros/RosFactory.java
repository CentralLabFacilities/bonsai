package de.unibi.citec.clf.bonsai.ros;

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
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import org.apache.log4j.Logger;
import org.ros.address.InetAddressFactory;
import org.ros.namespace.GraphName;
import org.ros.node.DefaultNodeMainExecutor;
import org.ros.node.NodeConfiguration;
import org.ros.node.NodeMainExecutor;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.*;
import java.util.concurrent.*;

/**
 * @author jkummert
 * @author lruegeme
 */
public class RosFactory implements CoreObjectFactory {

    static final String SERVICE_PKG_SENSOR = "de.unibi.citec.clf.bonsai.ros.sensors";
    static final String SERVICE_PKG_ACTUATOR = "de.unibi.citec.clf.bonsai.ros.actuators";
    //
    private static final String KEY_NODE_INIT_TIMEOUT = "NODE_INIT_TIMEOUT";
    private static final String KEY_INIT_SLEEP_TIME = "INIT_SLEEP_TIME";
    protected ServiceDiscovery serviceDiscoverySensor = new ReflectionServiceDiscovery(SERVICE_PKG_SENSOR);
    protected ServiceDiscovery serviceDiscoveryActuator = new ReflectionServiceDiscovery(SERVICE_PKG_ACTUATOR);
    protected Set<Class<? extends RosNode>> knownActuators = new HashSet<>();
    protected Set<Class<? extends RosSensor>> knownSensors = new HashSet<>();
    protected Map<String, Boolean> isActuatorInitialized = new ConcurrentHashMap<>();
    protected Map<String, Actuator> initializedActuatorsByKey = new ConcurrentHashMap<>();
    protected Map<String, Boolean> isSensorInitialized = new ConcurrentHashMap<>();
    protected Map<String, Sensor> initializedSensorsByKey = new ConcurrentHashMap<>();
    protected Map<String, ConfiguredObject> configuredObjectsByKey = new ConcurrentHashMap<>();
    private Logger logger = Logger.getLogger(getClass());
    private NodeMainExecutor nodeMainExecutor;
    private URI rosMasterUri;
    private CoordinateTransformer coordinateTransformer;
    private long nodeInitTimeout = 5000;
    private long sleepTime = 1000;

    /**
     * Constructor.
     */
    public RosFactory() {
        String master = System.getenv("ROS_MASTER_URI");

        if (master == null || master.isEmpty()) {
            logger.warn("ROS_MASTER_URI not set");
            master = "http://localhost:11311/";
        }
        try {
            rosMasterUri = new URI(master);
        } catch (URISyntaxException e) {
            logger.fatal(e);
            throw new RuntimeException(e);
        }
        logger.info("using ros master uri: " + rosMasterUri);
        nodeMainExecutor = DefaultNodeMainExecutor.newDefault();
        //spawn message factory node
        MsgTypeFactory.getInstance();

        //Check ip settings
        String local = System.getenv("ROS_IP");
        if (local == null || local.isEmpty()) {
            logger.warn("ROS_IP not set");
            //local;= InetAddressFactory.newNonLoopback().getHostAddress();
            //local = "127.0.0.1";
            local = System.getenv("basepc");
            if (local == null || local.isEmpty()) {
                try {
                    local = InetAddressFactory.newNonLoopback().getHostName();
                } catch (org.ros.exception.RosRuntimeException e) {
                    local = InetAddressFactory.newLoopback().getHostName();
                }

            }
        }
        logger.info("running nodes on: " + local);


    }

    /**
     * @param node node to execute
     * @param wait wait for isInitialised
     */
    public void spawnRosNode(RosNode node, boolean wait) throws TimeoutException, ExecutionException, InterruptedException {


        String local = System.getenv("ROS_IP");
        if (local == null || local.isEmpty()) {
            logger.warn("ROS_IP not set");
            //local;= InetAddressFactory.newNonLoopback().getHostAddress();
            //local = "127.0.0.1";

            local = System.getenv("basepc");
            if (local == null || local.isEmpty()) {
                logger.debug("basepc not set, using 127.0.0.1");
                try {
                    local = InetAddressFactory.newNonLoopback().getHostName();
                } catch (org.ros.exception.RosRuntimeException e) {
                    local = InetAddressFactory.newLoopback().getHostName();
                }

            }
        }

        logger.debug("running node: '" + node.getDefaultNodeName() +"' on: " + local + " , master: " + rosMasterUri);
        NodeConfiguration c = NodeConfiguration.newPublic(local, rosMasterUri);
        c.setNodeName(node.getDefaultNodeName());
        nodeMainExecutor.execute(node, c);
        //wait for node to be initialized
        if (wait && !node.isInitialised().get(nodeInitTimeout, TimeUnit.MILLISECONDS)) {
            throw new ExecutionException(new TimeoutException("could not start node in " + nodeInitTimeout));
        }
        logger.debug(node.getDefaultNodeName() + " started");
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
            if (configuredObjectsByKey.containsKey(actuator.getKey())) {
                logger.debug("..already configured.");
                continue;
            }

            // find the actuator configuration that can handle this requested
            for (Class<? extends RosNode> actuatorClass : knownActuators) {

                logger.trace("Checking if class " + actuatorClass + " satifies actuator " + actuator);

                boolean isSuitable = actuatorClass.equals(actuator.getActuatorClass())
                        && actuator.getInterfaceClass().isAssignableFrom(actuatorClass);

                if (!isSuitable) {
                    logger.trace("Actuator class " + actuatorClass + " does not satify actuator " + actuator);
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
                    Constructor<?> cons = actuatorClass.getConstructor(GraphName.class);
                    ManagedCoreObject object = (ManagedCoreObject) cons.newInstance(GraphName.of(RosNode.NODE_PREFIX + actuator.getKey()));
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
                        logger.debug(ex.getMessage());
                    }

                    for (Map.Entry<String, Class> entry : configured.conf.getUnusedOptionalParams().entrySet()) {
                        logger.debug("unused opt param: " + entry.getKey());
                    }
                    continue actuatorLoop;
                } catch (IllegalAccessException | InstantiationException | NoSuchMethodException | SecurityException |
                         InvocationTargetException ex) {
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
            for (Class<? extends RosSensor> sensorClass : knownSensors) {

                logger.trace("Checking if class " + sensorClass + " satifies sensor " + sensor);

                boolean isSuitable = sensorClass.equals(sensor.getSensorClass())
                        && org.ros.internal.message.Message.class.isAssignableFrom(sensor.getWireClass());

                if (!isSuitable) {
                    logger.trace("Sensor class " + sensorClass + " does not satify sensor " + sensor);
                    logger.trace("Sensor class: " + sensorClass);
                    logger.trace("Sensor needs: " + sensor.getSensorClass());
                    logger.trace("Sensor class == " + sensorClass.equals(sensor.getSensorClass()));
                    logger.trace("Sensor wire " + org.ros.internal.message.Message.class.isAssignableFrom(sensor.getWireClass()));
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
                    ManagedCoreObject object = (ManagedCoreObject) declaredConstructors[0].newInstance(
                            configured.data, configured.wire, GraphName.of(RosNode.NODE_PREFIX + sensor.getKey()));
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
                        logger.debug(ex.getMessage());
                    }

                    for (Map.Entry<String, Class> entry : configured.conf.getUnusedOptionalParams().entrySet()) {
                        logger.info("unused opt param: " + entry.getKey());
                    }
                    continue sensorLoop;
                } catch (IllegalAccessException | InstantiationException | NoSuchMethodException | SecurityException |
                         InvocationTargetException ex) {
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

        if (transformer.getTransformerClass().equals(TFTransformer.class)) {
            if (coordinateTransformer == null || !(coordinateTransformer instanceof TFTransformer)) {
                coordinateTransformer = new TFTransformer(GraphName.of(RosNode.NODE_PREFIX + "tf"), GraphName.of(RosNode.NODE_PREFIX + "tf2"));
            }
        } else if (transformer.getTransformerClass().equals(TfRosjavaWrapper.class)) {
            if (coordinateTransformer == null || !(coordinateTransformer instanceof TfRosjavaWrapper)) {
                coordinateTransformer = new TfRosjavaWrapper(GraphName.of(RosNode.NODE_PREFIX + "Transformer"));
                ((TfRosjavaWrapper) coordinateTransformer).getNode().setKey("Transformer");
            }
        } else if (transformer.getTransformerClass().equals(TFTransformerTimestamps.class)) {
            if (coordinateTransformer == null || !(coordinateTransformer instanceof TFTransformerTimestamps)) {
                coordinateTransformer = new TFTransformerTimestamps(GraphName.of(RosNode.NODE_PREFIX + "tf"), GraphName.of(RosNode.NODE_PREFIX + "tf2"));
            }
        } else {
            throw new IllegalArgumentException("can only create " + TFTransformer.class + " or " + TFTransformerTimestamps.class + " or " + TfRosjavaWrapper.class +
                    " but requested is: " + transformer.getTransformerClass());
        }

        return results;
    }

    public <T extends Actuator> T createActuator(String key, Class<T> actuatorClass, boolean wait)
            throws IllegalArgumentException, CoreObjectCreationException {
        logger.debug("create actuator: " + actuatorClass);

        if (isActuatorInitialized.get(key)) {
            //check if actuator is still connected
            if (((RosNode) initializedActuatorsByKey.get(key)).connectionsAlive()) {
                return (T) initializedActuatorsByKey.get(key);
            } else {
                // lost connection, shutdown
                logger.error("Actuator: " + key + " class: " + actuatorClass + ", seems to has lost its connections, shutdown and restart");
                isActuatorInitialized.put(key, false);
                ((RosNode) initializedActuatorsByKey.get(key)).destroyNode();
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
            Constructor<?> cons = obj.clazz.getConstructor(GraphName.class);
            actuator = (Actuator) cons.newInstance(GraphName.of(RosNode.NODE_PREFIX + key));
            ((RosNode) actuator).setKey(key);
            actuator.configure(obj.conf);
        } catch (NoSuchMethodException | SecurityException | InstantiationException | IllegalAccessException |
                 InvocationTargetException ex) {
            logger.error("failed to create instance");
            throw new CoreObjectCreationException(ex);
        } catch (ConfigurationException e) {
            throw new CoreObjectCreationException(e);
        }

        if (actuator instanceof RosNode) {
            try {
                spawnRosNode((RosNode) actuator, wait);
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

        logger.debug("create sensor for: " + dataType);
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
            sensor = (Sensor) declaredConstructors[0].newInstance(obj.data, obj.wire, GraphName.of(RosNode.NODE_PREFIX + key));
            ((RosNode) sensor).setKey(key);
            sensor.configure(obj.conf);
        } catch (NoSuchMethodException | SecurityException | InstantiationException | IllegalAccessException |
                 InvocationTargetException ex) {
            logger.error("failed to create instance");
            throw new CoreObjectCreationException(ex);
        } catch (ConfigurationException ex) {
            throw new CoreObjectCreationException(ex);
        } catch (ClassCastException ex) {
            assert false : "canCreateActuator seems to be wrong...";
            throw new CoreObjectCreationException(ex);
        }

        if (sensor instanceof RosNode) {
            try {
                spawnRosNode((RosNode) sensor, wait);
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


        knownActuators = serviceDiscoveryActuator.discoverServicesByInterface(RosNode.class);
        knownSensors = serviceDiscoverySensor.discoverServicesByInterface(RosSensor.class);
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
        logger.debug("createCoordinateTransformer ");

        if (coordinateTransformer == null)
            throw new CoreObjectCreationException("no ros transformer configured");

        if (coordinateTransformer instanceof TFTransformer) {
            TFTransformer c = (TFTransformer) coordinateTransformer;
            if (!c.getNode().initialized) {
                try {
                    spawnRosNode(c.getNode(), true);
                    spawnRosNode(c.getNode2(), true);
                } catch (TimeoutException | ExecutionException | InterruptedException e) {
                    throw new CoreObjectCreationException(e);
                }
            }
        } else  if (coordinateTransformer instanceof TFTransformerTimestamps) {
            TFTransformerTimestamps c = (TFTransformerTimestamps) coordinateTransformer;
            if (!c.getNode().initialized) {
                try {
                    spawnRosNode(c.getNode(), true);
                    spawnRosNode(c.getNode2(), true);
                } catch (TimeoutException | ExecutionException | InterruptedException e) {
                    throw new CoreObjectCreationException(e);
                }
            }
        } else {
            TfRosjavaWrapper c = (TfRosjavaWrapper) coordinateTransformer;
            if (!c.getNode().initialized) {
                try {
                    spawnRosNode(c.getNode(), true);
                } catch (TimeoutException | ExecutionException | InterruptedException e) {
                    throw new CoreObjectCreationException(e);
                }
            }
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
        initializedActuatorsByKey.values().stream().filter((a) -> (a instanceof RosNode)).forEachOrdered((a) -> {
            ((RosNode) a).destroyNode();
        });

        initializedSensorsByKey.values().stream().filter((s) -> (s instanceof RosNode)).forEachOrdered((s) -> {
            ((RosNode) s).destroyNode();
        });

        if (coordinateTransformer != null) {
            if (coordinateTransformer instanceof TFTransformer) {
                TFTransformer c = (TFTransformer) coordinateTransformer;
                c.getNode().destroyNode();
                c.getNode2().destroyNode();
            } else {
                TfRosjavaWrapper c = (TfRosjavaWrapper) coordinateTransformer;
                c.getNode().destroyNode();
            }

        }

        if (nodeMainExecutor != null) {
            nodeMainExecutor.shutdown();
        }
    }

    @Override
    public FactoryConfigurationResults createAndCacheAllConfiguredObjects() throws CoreObjectCreationException {
        logger.debug("createAndCacheAllConfiguredObjects()");
        FactoryConfigurationResults res = new FactoryConfigurationResults();
        Queue<RosNode> nodesQuene = new ConcurrentLinkedQueue<>();


        if (coordinateTransformer != null) {
            logger.debug("starting coordinateTransformer ");
            if (coordinateTransformer instanceof TFTransformer) {
                TFTransformer c = (TFTransformer) coordinateTransformer;
                logger.debug("data: " + c.getNode().initialized);
                try {
                    if(!c.getNode().connectionsAlive()) spawnRosNode(c.getNode(), false);
                    if(!c.getNode2().connectionsAlive()) spawnRosNode(c.getNode2(), false);
                } catch (TimeoutException | ExecutionException | InterruptedException e) {
                    logger.error(e);
                }
                nodesQuene.add(c.getNode());
                nodesQuene.add(c.getNode2());

            } else  if (coordinateTransformer instanceof TFTransformerTimestamps) {
                TFTransformerTimestamps c = (TFTransformerTimestamps) coordinateTransformer;
                try {
                    if(!c.getNode().connectionsAlive()) spawnRosNode(c.getNode(), false);
                    if(!c.getNode2().connectionsAlive()) spawnRosNode(c.getNode2(), false);
                } catch (TimeoutException | ExecutionException | InterruptedException e) {
                    logger.error(e);
                }
                nodesQuene.add(c.getNode());
                nodesQuene.add(c.getNode2());

            }else {
                TfRosjavaWrapper c = (TfRosjavaWrapper) coordinateTransformer;
                try {
                    if(!c.getNode().connectionsAlive()) spawnRosNode(c.getNode(), false);
                } catch (TimeoutException | ExecutionException | InterruptedException e) {
                    logger.error(e);
                }
                nodesQuene.add(c.getNode());
            }
        }

        configuredObjectsByKey.entrySet().parallelStream().forEach((entry) -> {
            String key = entry.getKey();
            ConfiguredObject obj = entry.getValue();

            RosNode node;
            logger.trace("Creating node " + key);

            try {
                if (obj instanceof ConfiguredActuator) {
                    if (isActuatorInitialized.getOrDefault(key,false)) {
                        logger.trace("already Initialized");
                    } else {
                        ConfiguredActuator act = (ConfiguredActuator) obj;
                        node = (RosNode) createActuator(key, act.clazz, false);
                        nodesQuene.add(node);
                    }
                } else if (obj instanceof ConfiguredSensor) {
                    if(isSensorInitialized.getOrDefault(key,false)) {
                        logger.trace("already Initialized");
                    } else {
                        ConfiguredSensor sen = (ConfiguredSensor) obj;
                        node = (RosNode) createSensor(key, sen.clazz, false);
                        nodesQuene.add(node);
                    }
                } else {
                    throw new CoreObjectCreationException("?");
                }

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
