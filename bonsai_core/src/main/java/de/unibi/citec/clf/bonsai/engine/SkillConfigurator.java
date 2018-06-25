package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.core.BonsaiManager;
import de.unibi.citec.clf.bonsai.core.exception.*;
import de.unibi.citec.clf.bonsai.core.object.*;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import org.apache.log4j.Logger;

import java.util.*;

/**
 * This class is a configuration object that is passed to skill implementations in order to receive a list of used
 * sensors and actuators also also to provide these to the implementation.
 *
 * @author lziegler
 */
public class SkillConfigurator implements ISkillConfigurator {

    public HashSet<String> getUnusedParams() {
        return unusedParams;
    }

    private HashSet<String> unusedParams;


    /**
     * A enum to distinguish between the different phases of the configuration.
     *
     * @author lziegler
     */
    private enum SkillConfigurationPhase {

        /**
         * The global configuration phase in which only a list of requested sensors and actuators is generated.
         */
        CONFIG,
        /**
         * The state configuration phase in which the skills receive their requested sensors and actuators.
         */
        OBJECT,
        /**
         * The {@link SkillConfigurator} is blocked while the concrete execution of a skill is active.
         */
        BLOCKED
    }

    private static Logger logger = Logger.getLogger(SkillConfigurator.class);
    private SkillConfigurationPhase phase;

    boolean isSkillConfigured() {
        return phase.equals(SkillConfigurationPhase.OBJECT);
    }

    private final Map<String, Class<?>> sensorRequests = new HashMap<>();
    private final Map<String, Class<?>> actuatorRequests = new HashMap<>();
    private final Map<String, Class<?>> slotRequests = new HashMap<>();
    private final Map<String, Class<?>> slotReaderRequests = new HashMap<>();
    private final Map<String, Class<?>> slotWriterRequests = new HashMap<>();

    private Map<String, String> slotXPathMapping = new HashMap<>();

    private Map<String, Object> values = new HashMap<>();
    private Map<String, String> configValues = null;

    private Map<String, Class> requiredParams = new HashMap<>();
    private Map<String, Class> optionalParams = new HashMap<>();
    private Map<String, Class> unusedOptionalParams = new HashMap<>();
    private List<ConfigurationException> exceptions = new LinkedList<>();

    private Map<String, Sensor<?>> localSensorCache = new HashMap<>();

    private Set<ExitToken> tokens = new HashSet<>();

    static public class Config {

        private Config() {
        }

        public boolean checkCoreCreation = false;
        public boolean unusedParamsAsError = false;
        public boolean activateObjectAnyway = false;

    }

    public static Config getDefaultConf() {
        return new Config();
    }

    private Config config = new Config();

    private SkillConfigurator(SkillConfigurationPhase phase, Map<String, String> vars) {
        this(phase, getDefaultConf(), vars);
    }

    private SkillConfigurator(SkillConfigurationPhase phase, Config cfg, Map<String, String> vars) {
        this.phase = phase;
        this.config = cfg;
        this.configValues = vars;
    }


    /**
     * Creates a {@link SkillConfigurator} instance for the global configuration phase. The created configurator will
     * not generate any actually working sensors or actuators, but collect a list of requested instances.
     *
     * @return a {@link SkillConfigurator} instance for the global configuration phase.
     */
    public static SkillConfigurator createConfigPhase(Map<String, String> vars) {
        return new SkillConfigurator(SkillConfigurationPhase.CONFIG, getDefaultConf(), vars);
    }

    /**
     * Creates a {@link SkillConfigurator} instance for the global configuration phase. The created configurator will
     * not generate any actually working sensors or actuators, but collect a list of requested instances.
     *
     * @return a {@link SkillConfigurator} instance for the global configuration phase.
     */
    public static SkillConfigurator createConfigPhase(Config cfg, Map<String, String> vars) {
        return new SkillConfigurator(SkillConfigurationPhase.CONFIG, cfg, vars);
    }

    private boolean checkParameters(Map<String, String> params) {

        boolean paramError = false;

        unusedParams = new HashSet<>(params.keySet());

        for (String key : params.keySet()) {
            String value = params.get(key);
            if (requiredParams.containsKey(key)) {
                Class c = requiredParams.get(key);
                try {
                    values.put(key, castValue(value, c));
                } catch (ConfigurationException e) {
                    paramError = true;
                    exceptions.add(new ParameterCastConfigurationException(key, c, value));
                }
            } else if (optionalParams.containsKey(key)) {
                Class c = optionalParams.get(key);
                try {
                    values.put(key, castValue(value, c));
                } catch (ConfigurationException e) {
                    paramError = true;
                    exceptions.add(new ConfigurationException(
                            "optional parameter: '" + key + "' with type '" + c
                                    + "' could not be parsed, value:'" + value + "'"));
                }
            } else {
                //exceptions.add(new ConfigurationException(
                //        "unused parameter: '" + key + "' and value '" + value + "' "));
                unusedParams.add(key);
            }
        }
        unusedParams.removeAll(requiredParams.keySet());
        unusedParams.removeAll(optionalParams.keySet());
        boolean hasUnusedParams = !unusedParams.isEmpty();

        unusedOptionalParams.putAll(optionalParams);
        unusedOptionalParams.keySet().removeAll(params.keySet());

        Map<String, Class> missingParams = new HashMap<>(requiredParams);
        missingParams.keySet().removeAll(params.keySet());

        if (config.unusedParamsAsError) {
            if (!unusedParams.isEmpty()) paramError = true;
            unusedParams.forEach((unused) -> {
                exceptions.add(new UnusedKeyConfigurationException(unused));
            });
        }

        if (!missingParams.isEmpty()) paramError = true;

        missingParams.entrySet().forEach((e) -> {
            exceptions.add(new MissingKeyConfigurationException(e.getKey(), e.getValue()));
        });

        return paramError;
    }

    private boolean checkSlots(Map<String, String> slotXPathMapping, boolean createDefaultMapping) {
        this.slotXPathMapping = (slotXPathMapping != null) ? slotXPathMapping : new HashMap<>();

        boolean missingSlotDef = false;

        for (String req : slotRequests.keySet()) {
            if (!this.slotXPathMapping.containsKey(req)) {
                if (createDefaultMapping) {
                    this.slotXPathMapping.put(req, "/defaults/" + req);
                } else {
                    missingSlotDef = true;
                    //todo
                    logger.warn("Missing Slot mapping for " + req);
                }
            }
        }
        return missingSlotDef;
    }

    public void activateObjectPhase(Map<String, String> params, Map<String, String> slotXPathMapping) throws ConfigurationException {
        activateObjectPhase(params, slotXPathMapping, true);
    }

    public void activateObjectPhase(Map<String, String> params, Map<String, String> slotXPathMapping, boolean createDefaultMapping) throws ConfigurationException {
        phase = SkillConfigurationPhase.BLOCKED;

        boolean paramError = checkParameters(params);

        //todo use me
        boolean slotError = checkSlots(slotXPathMapping, createDefaultMapping);

        if (!config.activateObjectAnyway && (paramError || slotError) ) {
            throw new ConfigurationException("error during skill configuration");
        }

        phase = SkillConfigurationPhase.OBJECT;

        //return hasUnusedParams;
    }

    public List<ConfigurationException> getExceptions() {
        return exceptions;
    }

    public Map<String, Class> getUnusedOptionalParams() {
        return unusedOptionalParams;
    }

    public TransformLookup getCoordinateTransformer() throws SkillConfigurationException {
        switch (phase) {
            case CONFIG:
                return null;
            case OBJECT:
                return BonsaiManager.getInstance().createCoordinateTransformer();
            case BLOCKED:
            default:
                logger.warn("Slot requested in non-configuration phase");
                throw new SkillConfigurationException("Receiving of slots is " + "blocked. Slots can only be received "
                        + "in configuration phase.");
        }
    }

    public void registerExitToken(ExitToken token) {
        tokens.add(token);
    }

    public Set<ExitToken> getRegisteredExitTokens() {
        return tokens;
    }

    public void setBlocked() {
        logger.debug("Configurator phase set to BLOCKED.");
        phase = SkillConfigurationPhase.BLOCKED;
    }

    public Map<String, Class<?>> getSensorRequests() {
        return sensorRequests;
    }

    public Map<String, Class<?>> getActuatorRequests() {
        return actuatorRequests;
    }

    public Map<String, Class<?>> getSlotRequests() {
        return slotRequests;
    }

    public Map<String, Sensor<?>> getSensorReferences() {
        return localSensorCache;
    }

    public Map<String, Class> getRequiredParams() {
        return requiredParams;
    }

    public Map<String, Class> getOptionalParams() {
        return optionalParams;
    }

    private <T> void insertSensor(String sensorName, Class<T> dataType) {

        logger.debug("Requested sensor \"" + sensorName + "\" with data type \"" + dataType + "\"");

        if (config.checkCoreCreation) {
            boolean canCreateSensor = BonsaiManager.getInstance().canCreateSensor(sensorName, dataType);
            if (!canCreateSensor) {
                exceptions.add(new ObjectCreationException(sensorName, dataType, "Sensor"));
            }
        }

        if (!sensorRequests.containsKey(sensorName)) {
            sensorRequests.put(sensorName, dataType);
        } else {
            logger.error("Sensor \"" + sensorName + "\" requested twice");
            exceptions.add(new SkillConfigurationException("A sensor for name \"" + sensorName + "\" was already requested"));
        }
    }

    private <T extends Actuator> void insertActuator(String actuatorName, Class<T> actuatorType) {

        logger.debug("Requested actuator \"" + actuatorName + "\" of type \"" + actuatorType + "\"");

        if (config.checkCoreCreation) {
            boolean canCreateActuator = BonsaiManager.getInstance().canCreateActuator(actuatorName, actuatorType);
            if (!canCreateActuator) {
                exceptions.add(new ObjectCreationException(actuatorName, actuatorType, "Actuator"));
            }
        }

        if (!actuatorRequests.containsKey(actuatorName)) {
            actuatorRequests.put(actuatorName, actuatorType);
        } else {
            logger.error("Actuator \"" + actuatorName + "\" requested twice");
            exceptions.add(new SkillConfigurationException("An actuator for name \"" + actuatorName + "\" was already requested"));
        }
    }

    private <T> void insertSlot(String slotName, Class<T> slotType, SlotDirection dir) {

        logger.debug("Requested slot \"" + slotName + "\" of type \"" + slotType.getSimpleName() + "\"");

        if (config.checkCoreCreation) {
            //todo
        }

        if (!slotRequests.containsKey(slotName)) {
            slotRequests.put(slotName, slotType);
            if (dir == SlotDirection.BI) {
                slotReaderRequests.put(slotName, slotType);
                slotWriterRequests.put(slotName, slotType);
            }
        } else if (dir != SlotDirection.BI) {
            Map<String, Class<?>> used = (dir == SlotDirection.IN) ? slotReaderRequests : slotWriterRequests;

            if (!used.containsKey(slotName)) {
                used.put(slotName, slotType);
            } else {
                logger.error("Slot \"" + slotName + "\" requested twice");
                exceptions.add(new SkillConfigurationException("A slot for name \"" + slotName + "\" was already requested."));
            }
        } else {
            logger.error("Slot \"" + slotName + "\" requested twice");
            exceptions.add(new SkillConfigurationException("A slot for name \"" + slotName + "\" was already requested."));
        }


    }

    private <T> Sensor<T> getCheckedSensor(String sensorName, Class<T> dataType) throws SkillConfigurationException {
        Sensor<T> sensor = BonsaiManager.getInstance().createSensor(sensorName, dataType);
        localSensorCache.put(sensorName, sensor);
        return sensor;
    }

    private <T extends Actuator> T getCheckedActuator(String actuatorName, Class<T> actuatorType)
            throws SkillConfigurationException {
        T a = BonsaiManager.getInstance().createActuator(actuatorName, actuatorType);
        return a;
    }

    private <T> MemorySlot<T> getCheckedSlot(String slotName, Class<T> slotType) throws SkillConfigurationException {
        String xpath = slotXPathMapping.get(slotName);
        String uniqueKey = "slottype:" + slotType.getName() + ";xpath:" + xpath;
        MemorySlot<T> slot;
        try {
            slot = BonsaiManager.getInstance().createWorkingMemory("WorkingMemory")
                    .getSlot(xpath, slotType);
        } catch (CommunicationException | CoreObjectCreationException | IllegalArgumentException ex) {
            throw new SkillConfigurationException(ex.getMessage());
        }
        return slot;
    }

    private <T> T castValue(String value, Class<T> type) throws ConfigurationException {
        try {
            if (type.equals(Double.class)) {
                return (T) (Double) Double.parseDouble(value);
            } else if (type == Integer.class) {
                return (T) (Integer) Integer.parseInt(value);
            } else if (type == Boolean.class) {
                if (value.equalsIgnoreCase("true") || value.equalsIgnoreCase("false")) {
                    return (T) (Boolean) Boolean.parseBoolean(value);
                }
            } else {
                return (T) value;
            }
        } catch (NumberFormatException e) {

        }

        throw new ConfigurationException("could not read value:'" + value + "' as type:'" + type + "'");

    }

    private <T> T getConfigValue(String key, T def, Class<T> type) {
        T ret = def;

        if (configValues == null) {
            return ret;
        }

        try {
            String value = configValues.getOrDefault(key, String.valueOf(def));
            ret = castValue(value, type);
            logger.debug(".. using config value " + value);
        } catch (Exception ex) {
            logger.debug(".. using config value failed" + ex.getMessage(),ex);
            logger.debug(".. have the following values");
            for(Map.Entry<String, String> a : configValues.entrySet()) {
                logger.debug(a.getKey()+"="+a.getValue());
            }
            logger.debug("def: "+ def);
            try{

            } catch (Exception e) {
                logger.debug(e);
            }
        }

        return ret;
    }

    private <T> T getValue(String key, Class<T> type) throws ConfigurationException {
        T val = null;

        Object o = values.getOrDefault(key, null);
        if (o == null) {
            throw new ConfigurationException("could not fetch required param '" + key + "' with type " + type);
        }

        try {
            val = (T) o;
        } catch (Exception ex) {
            throw new ConfigurationException("could not fetch param '" + key + "' with type " + type);
        }
        return val;
    }

    private <T> T getValue(String key, T def, Class<T> type) throws ConfigurationException {
        T val = null;

        if (values.containsKey(key)) {
            Object o = values.get(key);
            try {
                val = (T) o;
            } catch (Exception ex) {
                throw new ConfigurationException("could not fetch param '" + key + "' with type " + type);
            }
        } else {
            val = def;
        }
        return val;
    }

    private enum SlotDirection {
        IN, OUT, BI
    }

    private <T> MemorySlot<T> getSlot(String slotName, Class<T> slotType, SlotDirection dir) throws SkillConfigurationException {

        switch (phase) {
            case CONFIG:
                insertSlot(slotName, slotType, dir);
                return null;
            case OBJECT:
                return getCheckedSlot(slotName, slotType);
            case BLOCKED:
            default:
                logger.warn("Slot requested in non-configuration phase");
                throw new SkillConfigurationException("Receiving of slots is " + "blocked. Slots can only be received "
                        + "in configuration phase.");
        }
    }

    public Map<String, Class<?>> getSlotReaderRequests() {
        return slotReaderRequests;
    }

    public Map<String, Class<?>> getSlotWriterRequests() {
        return slotWriterRequests;
    }

    // ########################################################################
    // Implementations
    // ########################################################################
    @Override
    public int requestInt(String key) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                logger.debug("request INT " + key);
                requiredParams.put(key, Integer.class);
                return getConfigValue(key, 0, Integer.class);
            case BLOCKED:
                throw new ConfigurationException("Configurator is blocked, had errors during configuration");
            default:
                return getValue(key, Integer.class);
        }
    }

    @Override
    public int requestOptionalInt(String key, int def) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                logger.debug("request INT " + key + " default:" + def);
                optionalParams.put(key, Integer.class);
                return getConfigValue(key, def, Integer.class);
            case BLOCKED:
                throw new ConfigurationException("Configurator is blocked, had errors during configuration");
            default:
                return getValue(key, def, Integer.class);
        }
    }

    @Override
    public double requestDouble(String key) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                logger.debug("request Double " + key);
                requiredParams.put(key, Double.class);
                return getConfigValue(key, 0.0, Double.class);
            case BLOCKED:
                throw new ConfigurationException("Configurator is blocked, had errors during configuration");
            default:
                return getValue(key, Double.class);
        }
    }

    @Override
    public double requestOptionalDouble(String key, double def) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                logger.debug("request double " + key + " default:" + def);
                optionalParams.put(key, Double.class);
                return getConfigValue(key, def, Double.class);
            case BLOCKED:
                throw new ConfigurationException("Configurator is blocked, had errors during configuration");
            default:
                return getValue(key, def, Double.class);
        }

    }

    @Override
    public String requestValue(String key) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                logger.debug("request value " + key);
                requiredParams.put(key, String.class);
                return getConfigValue(key, "", String.class);
            case BLOCKED:
                throw new ConfigurationException("Configurator is blocked, had errors during configuration");
            default:
                return getValue(key, String.class);
        }

    }

    @Override
    public String requestOptionalValue(String key, String def) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                logger.debug("request value " + key + " default:" + def);
                optionalParams.put(key, String.class);
                return getConfigValue(key, def, String.class);
            case BLOCKED:
                throw new ConfigurationException("Configurator is blocked, had errors during configuration");
            default:
                return getValue(key, def, String.class);
        }

    }

    @Override
    public boolean requestBool(String key) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                logger.debug("request bool " + key);
                requiredParams.put(key, Boolean.class);
                return getConfigValue(key, false, Boolean.class);
            case BLOCKED:
                throw new ConfigurationException("Configurator is blocked, had errors during configuration");
            default:
                return getValue(key, Boolean.class);
        }
    }

    @Override
    public boolean requestOptionalBool(String key, boolean def) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                logger.debug("request bool " + key + " default:" + def);
                optionalParams.put(key, Boolean.class);
                return getConfigValue(key, def, Boolean.class);
            case BLOCKED:
                throw new ConfigurationException("Configurator is blocked, had errors during configuration");
            default:
                return getValue(key, def, Boolean.class);
        }
    }

    /**
     * Returns the instance of a sensor. In the global configuration phase this only registers a sensor as a request,
     * but does not actually return a functioning sensor. The state configuration phase the functioning sensor is
     * returned.
     *
     * @param <T>        Type of the data items received by the sensor.
     * @param sensorName Name of the sensor in the bonsai configuration.
     * @param dataType   Class that is processed by the requested sensor.
     * @return The requested sensor in the state config phase or null in the global config phase.
     */
    @Override
    public <T> Sensor<T> getSensor(String sensorName, Class<T> dataType) throws SkillConfigurationException {

        switch (phase) {
            case CONFIG:
                insertSensor(sensorName, dataType);
                return null;
            case OBJECT:
                return getCheckedSensor(sensorName, dataType);
            case BLOCKED:
            default:
                logger.warn("Sensor requested in non-configuration phase");
                throw new SkillConfigurationException("Receiving of sensors is "
                        + "blocked. Sensors can only be receive in configuration " + "phase,");
        }
    }

    /**
     * Returns the instance of an actuator which is managed in the SCXMLSensorActuatorManager.
     *
     * @param <T>          Type of the requested actuator.
     * @param actuatorName Name of the actuator.
     * @param actuatorType (BTL) Class that is processed by the requested actuator.
     * @return The requested actuator or null, if no actuator with the given name exists.
     */
    @Override
    public <T extends Actuator> T getActuator(String actuatorName, Class<T> actuatorType)
            throws SkillConfigurationException {

        switch (phase) {
            case CONFIG:
                insertActuator(actuatorName, actuatorType);
                return null;
            case OBJECT:
                return getCheckedActuator(actuatorName, actuatorType);
            case BLOCKED:
            default:
                logger.warn("Actuator requested in non-configuration phase");
                throw new SkillConfigurationException("Receiving of actuators is "
                        + "blocked. Actuators can only be received " + "in configuration phase.");
        }
    }

    /**
     * Returns the instance of a slot.
     *
     * @param <T>      Type of the requested slot.
     * @param slotName Name of the slot.
     * @param slotType Class that is processed by the requested slot.
     * @return The requested slot or null, if no slot with the given name exists.
     */
    @Override
    public <T> MemorySlot<T> getSlot(String slotName, Class<T> slotType) throws SkillConfigurationException {
        return getSlot(slotName, slotType, SlotDirection.BI);
    }

    @Override
    public <T> MemorySlotReader<T> getReadSlot(String slotName, Class<T> slotType) throws SkillConfigurationException {
        return getSlot(slotName, slotType, SlotDirection.IN);
    }

    @Override
    public <T> MemorySlotWriter<T> getWriteSlot(String slotName, Class<T> slotType) throws SkillConfigurationException {
        return getSlot(slotName, slotType, SlotDirection.OUT);
    }

    @Override
    public TransformLookup getTransform() throws SkillConfigurationException {
        return getCoordinateTransformer();
    }

    @Override
    public ExitToken requestExitToken(ExitStatus status) throws SkillConfigurationException {
        return ExitToken.createToken(status, this);
    }


}
